import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { RbacService } from '../common/rbac/rbac.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.WEB_AUTH_JWT_SECRET || process.env.JWT_SECRET || 'web-auth-jwt-secret',
      signOptions: {
        expiresIn: (process.env.WEB_AUTH_JWT_EXPIRES_IN || '15m') as any,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SmsService, RbacService],
})
export class AuthModule {}
