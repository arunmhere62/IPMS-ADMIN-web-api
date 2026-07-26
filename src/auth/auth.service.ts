import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHmac } from 'crypto';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService {
  private readonly otpExpiryMinutes = Number(process.env.WEB_AUTH_OTP_EXPIRY_MINUTES ?? 5);
  private readonly otpLength = Number(process.env.WEB_AUTH_OTP_LENGTH ?? 4);
  private readonly otpMaxAttempts = Number(process.env.WEB_AUTH_OTP_MAX_ATTEMPTS ?? 5);
  private readonly otpSecret = process.env.WEB_AUTH_OTP_SECRET ?? 'web-auth-otp-secret';

  private readonly refreshTokenDays = Number(process.env.WEB_AUTH_REFRESH_DAYS ?? 30);

  constructor(
    private readonly managementPrisma: ManagementPrismaService,
    private readonly jwtService: JwtService,
    private readonly smsService: SmsService,
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

    const smsSent = await this.smsService.sendOtp(phone, otp);
    if (!smsSent) {
      throw new BadRequestException('Failed to send OTP. Please try again.');
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

    // Ensure organization and role are set for this user
    let updatedUser = user;
    const defaultOrgName = process.env.MGMT_DEFAULT_ORG_NAME ?? 'Indian PG Management';
    const [superAdminRole, salesManagerRole, salesRepRole] = await Promise.all([
      this.managementPrisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } }),
      this.managementPrisma.role.findUnique({ where: { name: 'SALES_MANAGER' } }),
      this.managementPrisma.role.findUnique({ where: { name: 'SALES_REP' } }),
    ]);

    // Ensure default organization exists
    let defaultOrg = await this.managementPrisma.organization.findFirst({ where: { name: defaultOrgName } });
    if (!defaultOrg) {
      defaultOrg = await this.managementPrisma.organization.create({
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
      include: { organization: true, role: true },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: fullUser?.s_no,
      phone: fullUser?.phone,
      email: fullUser?.email,
      role: fullUser?.role?.name,
      organization_id: fullUser?.organization_id,
    });

    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = createHmac('sha256', this.otpSecret)
      .update(refreshToken)
      .digest('hex');

    const refreshExpiresAt = new Date(now.getTime() + this.refreshTokenDays * 24 * 60 * 60 * 1000);

    await this.managementPrisma.session.create({
      data: {
        user_s_no: user.s_no,
        refresh_token_hash: refreshTokenHash,
        expires_at: refreshExpiresAt,
        ip_address: requestMeta?.ip,
        user_agent: requestMeta?.userAgent,
      },
    });

    return ResponseUtil.success(
      {
        user: {
          s_no: fullUser?.s_no,
          name: fullUser?.name,
          email: fullUser?.email,
          phone: fullUser?.phone,
          role: fullUser?.role?.name,
          organization: fullUser?.organization ? { s_no: fullUser.organization.s_no, name: fullUser.organization.name } : null,
        },
        accessToken,
        refreshToken,
      },
      'Login successful',
    );
  }
}
