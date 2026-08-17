import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route or controller as publicly accessible (skips JWT validation).
 * Use on auth endpoints, health checks, and external webhooks only.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
