import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
