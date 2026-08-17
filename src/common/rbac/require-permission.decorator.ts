import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Declares one or more permissions that the authenticated user must have
 * to access the decorated route or controller.
 *
 * By default ALL listed permissions are required (mode: 'all').
 * Use mode: 'any' to require at least one of them.
 *
 * Example:
 *   @RequirePermission('crm.leads:view')
 *   @RequirePermission('crm.leads:view', 'crm.leads:create')
 *   @RequirePermission({ permissions: ['crm.leads:view'], mode: 'any' })
 */
export type RequirePermissionOptions =
  | string
  | string[]
  | { permissions: string[]; mode?: 'all' | 'any' };

export const RequirePermission = (...permissions: RequirePermissionOptions[]) => {
  const normalized = permissions.flatMap((p) => {
    if (typeof p === 'string') return p;
    if (Array.isArray(p)) return p;
    return p.permissions;
  });

  const mode: 'all' | 'any' = permissions.some(
    (p) => typeof p === 'object' && !Array.isArray(p) && p.mode === 'any',
  )
    ? 'any'
    : 'all';

  return SetMetadata(PERMISSIONS_KEY, { permissions: normalized, mode });
};
