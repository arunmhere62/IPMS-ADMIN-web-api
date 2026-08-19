import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface AdminWebJwtPayload {
  sub: number;
  phone?: string;
  email?: string | null;
  role?: string | null;
  permissions?: string[];
  organization_id?: number | null;
}

declare module 'express' {
  interface Request {
    user?: AdminWebJwtPayload;
  }
}

/**
 * Validates the Authorization Bearer JWT set by the admin web frontend.
 * Throws UnauthorizedException if the token is missing or invalid.
 * On success, attaches `req.user` with the decoded payload.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AdminWebJwtPayload>(token, {
        secret: process.env.WEB_AUTH_JWT_SECRET || process.env.JWT_SECRET || 'web-auth-jwt-secret',
      });

      request.user = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException(`Invalid or expired token: ${(err as Error).message}`);
    }
  }
}
