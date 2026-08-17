import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permission.decorator';
import { AdminWebJwtPayload } from '../guards/jwt-auth.guard';

type StoredPermissionMetadata = {
  permissions: string[];
  mode: 'all' | 'any';
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.getRequiredPermissions(context);
    if (!required || required.permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AdminWebJwtPayload | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('User identity not available');
    }

    const userPermissions = new Set(user.permissions ?? []);

    const { permissions, mode } = required;
    const check =
      mode === 'any'
        ? permissions.some((p) => userPermissions.has(p))
        : permissions.every((p) => userPermissions.has(p));

    if (!check) {
      throw new ForbiddenException(
        `Missing required permission${permissions.length > 1 ? 's' : ''}: ${permissions.join(', ')}`,
      );
    }

    return true;
  }

  private getRequiredPermissions(context: ExecutionContext): StoredPermissionMetadata | null {
    const stored = this.reflector.getAllAndOverride<StoredPermissionMetadata>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!stored || !Array.isArray(stored.permissions) || stored.permissions.length === 0) {
      return null;
    }

    return {
      permissions: stored.permissions,
      mode: stored.mode === 'any' ? 'any' : 'all',
    };
  }
}
