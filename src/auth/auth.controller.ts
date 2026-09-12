import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to user phone number (for web login)' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async sendOtp(
    @Body() dto: SendOtpDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')?.[0]?.trim();
    return this.authService.sendOtp(dto, { ip, userAgent });
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to user phone number (for web login)' })
  @ApiResponse({ status: 200, description: 'OTP resent successfully' })
  async resendOtp(
    @Body() dto: SendOtpDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')?.[0]?.trim();
    return this.authService.resendOtp(dto, { ip, userAgent });
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and login user (web)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')?.[0]?.trim();
    return this.authService.verifyOtp(dto, { ip, userAgent });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token (with rotation)' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')?.[0]?.trim();
    return this.authService.refreshTokens(dto, { ip, userAgent });
  }

  @Post('refresh-permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh the current user permissions and access token' })
  @ApiResponse({ status: 200, description: 'Permissions refreshed successfully' })
  async refreshPermissions(@Req() req: Request) {
    return this.authService.refreshPermissions(Number(req.user?.sub));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user by revoking refresh token session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }
}
