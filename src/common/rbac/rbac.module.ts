import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RbacController } from './rbac.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.WEB_AUTH_JWT_SECRET ?? process.env.JWT_SECRET ?? 'web-auth-jwt-secret',
      signOptions: {
        expiresIn: (process.env.WEB_AUTH_JWT_EXPIRES_IN ?? '24h') as any,
      },
    }),
  ],
  controllers: [RbacController],
  providers: [
    RbacService,
    JwtAuthGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [RbacService, JwtAuthGuard, PermissionsGuard],
})
export class RbacModule implements OnModuleInit {
  constructor(private readonly rbacService: RbacService) {}

  async onModuleInit() {
    await this.rbacService.seedRolesAndAssignments();
  }
}
