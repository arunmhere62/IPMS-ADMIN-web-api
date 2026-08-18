import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHmac } from 'crypto';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { RbacService } from '../common/rbac/rbac.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SmsService } from './sms.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly otpExpiryMinutes = Number(process.env.WEB_AUTH_OTP_EXPIRY_MINUTES ?? 5);
  private readonly otpLength = Number(process.env.WEB_AUTH_OTP_LENGTH ?? 4);
  private readonly otpMaxAttempts = Number(process.env.WEB_AUTH_OTP_MAX_ATTEMPTS ?? 5);
  private readonly otpSecret = process.env.WEB_AUTH_OTP_SECRET ?? 'web-auth-otp-secret';

  private readonly refreshTokenDays = Number(process.env.WEB_AUTH_REFRESH_DAYS ?? 30);
  private readonly refreshSecret = process.env.WEB_AUTH_REFRESH_SECRET ?? process.env.JWT_REFRESH_SECRET ?? this.otpSecret;

  constructor(
    private readonly managementPrisma: ManagementPrismaService,
    private readonly jwtService: JwtService,
    private readonly smsService: SmsService,
    private readonly rbacService: RbacService,
  ) {}

  private normalizePhone(phone: string) {
    return String(phone ?? '').trim();
  }

  private generateOtp(): string {
    if (process.env.NODE_ENV !== 'production') {
      return '1234';
    }

    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < this.otpLength; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }

  private hashOtp(identifier: string, otp: string) {
    return createHmac('sha256', this.otpSecret)
      .update(`${identifier}:${otp}`)
      .digest('hex');
  }

  // ─── Token & Session helpers ───

  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async issueTokens(
    user: { s_no: number; phone?: string | null; email?: string | null; role?: { name: string } | null; organization_id?: number | null },
    permissions: Set<string>,
    requestMeta?: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; sessionSNo: number }> {
    const now = new Date();

    const accessToken = await this.jwtService.signAsync({
      sub: user.s_no,
      phone: user.phone,
      email: user.email,
      role: user.role?.name,
      permissions: Array.from(permissions),
      organization_id: user.organization_id,
    });

    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshExpiresAt = new Date(now.getTime() + this.refreshTokenDays * 24 * 60 * 60 * 1000);

    const session = await this.managementPrisma.session.create({
      data: {
        user_s_no: user.s_no,
        refresh_token_hash: refreshTokenHash,
        expires_at: refreshExpiresAt,
        ip_address: requestMeta?.ip,
        user_agent: requestMeta?.userAgent,
      },
    });

    return { accessToken, refreshToken, sessionSNo: session.s_no };
  }

  private async revokeSession(sessionSNo: number): Promise<void> {
    await this.managementPrisma.session.updateMany({
      where: { s_no: sessionSNo, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async findSessionByRefreshToken(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    return this.managementPrisma.session.findFirst({
      where: { refresh_token_hash: tokenHash, revoked_at: null },
      include: { user: { include: { role: true, sales_organization: true } } },
    });
  }

  async sendOtp(dto: SendOtpDto, requestMeta?: { ip?: string; userAgent?: string }) {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('Phone is required');
    }

    const user = await this.managementPrisma.user.findFirst({
      where: { phone, is_active: true },
    });

    if (!user) {
      throw new NotFoundException('User not found with this phone number');
    }

    const otp = this.generateOtp();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.otpExpiryMinutes * 60 * 1000);

    // In dev mode, skip SMS and log the OTP + bypass code
    const isDevMode = process.env.NODE_ENV !== 'production';
    if (isDevMode) {
      this.logger.warn(`[DEV] OTP for ${phone}: ${otp} (or use bypass code: 5555)`);
    } else {
      const smsSent = await this.smsService.sendOtp(phone, otp);
      if (!smsSent) {
        throw new BadRequestException('Failed to send OTP. Please try again.');
      }
    }

    const created = await this.managementPrisma.otp_request.create({
      data: {
        user_s_no: user.s_no,
        identifier: phone,
        channel: 'SMS',
        purpose: 'WEB_LOGIN',
        otp_hash: this.hashOtp(phone, otp),
        expires_at: expiresAt,
        max_attempts: this.otpMaxAttempts,
        attempt_count: 0,
        ip_address: requestMeta?.ip,
        user_agent: requestMeta?.userAgent,
      },
    });

    return ResponseUtil.success(
      {
        phone,
        expiresIn: `${this.otpExpiryMinutes} minutes`,
        requestId: created.s_no,
      },
      'OTP sent successfully',
    );
  }

  async resendOtp(dto: SendOtpDto, requestMeta?: { ip?: string; userAgent?: string }) {
    return this.sendOtp(dto, requestMeta);
  }

  async verifyOtp(dto: VerifyOtpDto, requestMeta?: { ip?: string; userAgent?: string }) {
    const phone = this.normalizePhone(dto.phone);
    const otp = String(dto.otp ?? '').replace(/[^0-9]/g, '');

    if (!phone || !otp) {
      throw new BadRequestException('Phone and otp are required');
    }

    const user = await this.managementPrisma.user.findFirst({
      where: { phone, is_active: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ─── Dev mode OTP bypass ───
    // When NODE_ENV is not production, accept 5555 as a bypass OTP
    // This allows testing without receiving real SMS
    const isDevMode = process.env.NODE_ENV !== 'production';
    const DEV_BYPASS_OTP = '5555';

    if (isDevMode && otp === DEV_BYPASS_OTP) {
      this.logger.warn(`[DEV] Bypass OTP 5555 used for ${phone} — login allowed without SMS verification`);

      // Mark the most recent OTP request as consumed (if exists)
      const now = new Date();
      const recentRequest = await this.managementPrisma.otp_request.findFirst({
        where: { identifier: phone, purpose: 'WEB_LOGIN' },
        orderBy: { created_at: 'desc' },
      });
      if (recentRequest && !recentRequest.consumed_at) {
        await this.managementPrisma.otp_request.update({
          where: { s_no: recentRequest.s_no },
          data: { consumed_at: now, attempt_count: { increment: 1 } },
        });
      }

      // Skip OTP hash verification — proceed directly to login
      return this.completeLogin(user, requestMeta);
    }

    const now = new Date();

    const request = await this.managementPrisma.otp_request.findFirst({
      where: {
        identifier: phone,
        purpose: 'WEB_LOGIN',
        expires_at: { gt: now },
        consumed_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!request) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (request.attempt_count >= request.max_attempts) {
      throw new UnauthorizedException('OTP attempts exceeded');
    }

    const otpHash = this.hashOtp(phone, otp);
    const ok = otpHash === request.otp_hash;

    await this.managementPrisma.$transaction(async (tx) => {
      await tx.otp_attempt.create({
        data: {
          otp_request_s_no: request.s_no,
          user_s_no: user.s_no,
          identifier: phone,
          purpose: 'WEB_LOGIN',
          succeeded: ok,
          ip_address: requestMeta?.ip,
          user_agent: requestMeta?.userAgent,
        },
      });

      await tx.otp_request.update({
        where: { s_no: request.s_no },
        data: {
          attempt_count: { increment: 1 },
          last_attempt_at: now,
          consumed_at: ok ? now : null,
        },
      });
    });

    if (!ok) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    return this.completeLogin(user, requestMeta);
  }

  /**
   * Complete the login flow after OTP is verified.
   * Ensures org/role are set, issues tokens, returns user + tokens.
   * Shared between normal OTP verification and dev bypass.
   */
  private async completeLogin(user: any, requestMeta?: { ip?: string; userAgent?: string }) {
    // Ensure organization and role are set for this user
    let updatedUser = user;
    const defaultOrgName = process.env.MGMT_DEFAULT_ORG_NAME ?? 'Indian PG Management';
    const [superAdminRole, salesManagerRole, salesRepRole] = await Promise.all([
      this.managementPrisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } }),
      this.managementPrisma.role.findUnique({ where: { name: 'SALES_MANAGER' } }),
      this.managementPrisma.role.findUnique({ where: { name: 'SALES_REP' } }),
    ]);

    // Ensure default sales organization exists
    let defaultOrg = await this.managementPrisma.sales_organization.findFirst({ where: { name: defaultOrgName } });
    if (!defaultOrg) {
      defaultOrg = await this.managementPrisma.sales_organization.create({
        data: { name: defaultOrgName, status: 'ACTIVE' as any },
      });
    }

    // If user has no org/role, assign sensible defaults
    if (!user.organization_id || !user.role_id) {
      let roleIdToAssign = user.role_id ?? undefined;
      if (!roleIdToAssign) {
        // First super admin bootstrap: if no user has SUPER_ADMIN, make this user SUPER_ADMIN, else SALES_REP
        const superAdminId = superAdminRole?.s_no;
        const countSuperAdmins = superAdminId
          ? await this.managementPrisma.user.count({ where: { role_id: superAdminId } })
          : 0;
        roleIdToAssign = countSuperAdmins === 0 ? superAdminId ?? salesRepRole?.s_no ?? undefined : salesRepRole?.s_no ?? undefined;
      }

      updatedUser = await this.managementPrisma.user.update({
        where: { s_no: user.s_no },
        data: {
          organization_id: user.organization_id ?? defaultOrg.s_no,
          role_id: roleIdToAssign,
        },
      });
    }

    // Re-fetch with relations for response
    const fullUser = await this.managementPrisma.user.findUnique({
      where: { s_no: updatedUser.s_no },
      include: { sales_organization: true, role: true },
    });

    const permissions = await this.rbacService.getUserPermissions(fullUser?.s_no ?? 0);

    const { accessToken, refreshToken } = await this.issueTokens(fullUser!, permissions, requestMeta);

    return ResponseUtil.success(
      {
        user: {
          s_no: fullUser?.s_no,
          name: fullUser?.name,
          email: fullUser?.email,
          phone: fullUser?.phone,
          role: fullUser?.role?.name,
          permissions: Array.from(permissions),
          organization: fullUser?.sales_organization ? { s_no: fullUser.sales_organization.s_no, name: fullUser.sales_organization.name } : null,
        },
        accessToken,
        refreshToken,
      },
      'Login successful',
    );
  }

  // ─── Refresh Token with Rotation ───

  async refreshTokens(dto: RefreshTokenDto, requestMeta?: { ip?: string; userAgent?: string }) {
    const refreshToken = String(dto.refreshToken ?? '').trim();
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const session = await this.findSessionByRefreshToken(refreshToken);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const now = new Date();

    // Check expiry
    if (session.expires_at < now) {
      await this.revokeSession(session.s_no);
      throw new UnauthorizedException('Refresh token expired. Please login again.');
    }

    // Check user is still active
    if (!session.user || !session.user.is_active) {
      await this.revokeSession(session.s_no);
      throw new UnauthorizedException('User account is inactive');
    }

    // Re-fetch permissions (they may have changed since login)
    const permissions = await this.rbacService.getUserPermissions(session.user.s_no);

    // Rotate: revoke old session, issue new tokens with a new session
    await this.revokeSession(session.s_no);
    const { accessToken, refreshToken: newRefreshToken } = await this.issueTokens(
      session.user,
      permissions,
      requestMeta,
    );

    return ResponseUtil.success(
      {
        accessToken,
        refreshToken: newRefreshToken,
      },
      'Token refreshed successfully',
    );
  }

  // ─── Logout ───

  async logout(dto: RefreshTokenDto) {
    const refreshToken = String(dto.refreshToken ?? '').trim();
    if (!refreshToken) {
      // No token to revoke, just return success
      return ResponseUtil.success(null, 'Logged out successfully');
    }

    const session = await this.findSessionByRefreshToken(refreshToken);
    if (session) {
      await this.revokeSession(session.s_no);
    }

    return ResponseUtil.success(null, 'Logged out successfully');
  }
}
