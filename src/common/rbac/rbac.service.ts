import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ManagementPrismaService } from '../../prisma/management-prisma.service';
import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  buildPermissionKey,
  DEFAULT_ROLE_DESCRIPTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  parsePermissionKey,
  type PermissionAction,
} from './permissions.catalog';

export type EffectivePermission = {
  permissionId: number;
  resource: string;
  action: string;
  key: string;
  granted: boolean;
  source: 'role' | 'override';
};

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private readonly managementPrisma: ManagementPrismaService) {}

  /**
   * Resolve the effective permissions for a user.
   * Returns a Set of granted permission keys (resource:action).
   * Role permissions are applied first, then user-level overrides
   * (granted=true adds, granted=false revokes).
   */
  async getUserPermissions(userId: number): Promise<Set<string>> {
    const user = await this.managementPrisma.user.findUnique({
      where: { s_no: userId },
      select: { role_id: true },
    });

    const roleId = user?.role_id ?? null;
    const rolePermissions = roleId
      ? await this.managementPrisma.role_permission.findMany({
          where: { role_id: roleId },
          include: { permission: true },
        })
      : [];

    const granted = new Map<string, EffectivePermission>();
    for (const rp of rolePermissions) {
      const key = buildPermissionKey(rp.permission.resource, rp.permission.action);
      granted.set(key, {
        permissionId: rp.permission_id,
        resource: rp.permission.resource,
        action: rp.permission.action,
        key,
        granted: true,
        source: 'role',
      });
    }

    // Apply user-level overrides.
    const overrides = await this.managementPrisma.user_permission_override.findMany({
      where: { user_id: userId },
      include: { permission: true },
    });
    for (const o of overrides) {
      const key = buildPermissionKey(o.permission.resource, o.permission.action);
      if (o.granted) {
        granted.set(key, {
          permissionId: o.permission_id,
          resource: o.permission.resource,
          action: o.permission.action,
          key,
          granted: true,
          source: 'override',
        });
      } else {
        granted.delete(key);
      }
    }

    return new Set(granted.keys());
  }

  /**
   * Check whether a user has a specific permission.
   */
  async userHasPermission(userId: number, key: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.has(key);
  }

  /**
   * Check whether a user has any of the provided permissions.
   */
  async userHasAnyPermission(userId: number, keys: string[]): Promise<boolean> {
    if (keys.length === 0) return true;
    const permissions = await this.getUserPermissions(userId);
    return keys.some((k) => permissions.has(k));
  }

  /**
   * Check whether a user has all of the provided permissions.
   */
  async userHasAllPermissions(userId: number, keys: string[]): Promise<boolean> {
    if (keys.length === 0) return true;
    const permissions = await this.getUserPermissions(userId);
    return keys.every((k) => permissions.has(k));
  }

  /**
   * Get the full permission catalog with the user's effective grants.
   * Useful for the "Role Permissions" UI screen.
   */
  async getUserPermissionsWithStatus(userId: number): Promise<{
    roleName: string | null;
    permissions: Array<{ key: string; resource: string; action: string; description: string; granted: boolean }>;
  }> {
    const user = await this.managementPrisma.user.findUnique({
      where: { s_no: userId },
      include: { role: true },
    });

    const granted = await this.getUserPermissions(userId);

    const permissions = ALL_PERMISSIONS.map((p) => ({
      key: buildPermissionKey(p.resource, p.action),
      resource: p.resource,
      action: p.action,
      description: p.description,
      granted: granted.has(buildPermissionKey(p.resource, p.action)),
    }));

    return { roleName: user?.role?.name ?? null, permissions };
  }

  /**
   * Get full permission catalog with grants for a specific role.
   */
  async getRolePermissionsWithStatus(roleId: number): Promise<{
    role: { s_no: number; name: string; description: string | null } | null;
    permissions: Array<{ key: string; resource: string; action: string; description: string; granted: boolean }>;
  }> {
    const role = await this.managementPrisma.role.findUnique({
      where: { s_no: roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const rolePermissions = await this.managementPrisma.role_permission.findMany({
      where: { role_id: roleId },
      include: { permission: true },
    });
    const grantedIds = new Set(rolePermissions.map((rp) => rp.permission_id));

    const allPermissions = await this.managementPrisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    const permissions = allPermissions.map((p) => ({
      key: buildPermissionKey(p.resource, p.action),
      resource: p.resource,
      action: p.action,
      description: p.description ?? '',
      granted: grantedIds.has(p.s_no),
    }));

    return {
      role: { s_no: role.s_no, name: role.name, description: role.description },
      permissions,
    };
  }

  /**
   * Replace all permissions for a role.
   */
  async setRolePermissions(roleId: number, permissionKeys: string[]) {
    const role = await this.managementPrisma.role.findUnique({
      where: { s_no: roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permissionIds = await this.resolvePermissionIds(permissionKeys);

    await this.managementPrisma.$transaction(async (tx) => {
      await tx.role_permission.deleteMany({ where: { role_id: roleId } });
      if (permissionIds.length > 0) {
        await tx.role_permission.createMany({
          data: permissionIds.map((permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getRolePermissionsWithStatus(roleId);
  }

  /**
   * Add or remove a single permission override for a user.
   */
  async setUserPermissionOverride(userId: number, permissionKey: string, granted: boolean, reason?: string) {
    const parsed = parsePermissionKey(permissionKey);
    if (!parsed) {
      throw new NotFoundException('Invalid permission key');
    }

    const permission = await this.managementPrisma.permission.findUnique({
      where: {
        resource_action: {
          resource: parsed.resource,
          action: parsed.action as PermissionAction,
        },
      },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.managementPrisma.user_permission_override.upsert({
      where: {
        user_id_permission_id: {
          user_id: userId,
          permission_id: permission.s_no,
        },
      },
      create: {
        user_id: userId,
        permission_id: permission.s_no,
        granted,
        reason,
      },
      update: {
        granted,
        reason,
      },
    });

    return this.getUserPermissionsWithStatus(userId);
  }

  /**
   * Remove a user permission override.
   */
  async removeUserPermissionOverride(userId: number, permissionKey: string) {
    const parsed = parsePermissionKey(permissionKey);
    if (!parsed) {
      throw new NotFoundException('Invalid permission key');
    }

    const permission = await this.managementPrisma.permission.findUnique({
      where: {
        resource_action: {
          resource: parsed.resource,
          action: parsed.action as PermissionAction,
        },
      },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.managementPrisma.user_permission_override.deleteMany({
      where: {
        user_id: userId,
        permission_id: permission.s_no,
      },
    });

    return this.getUserPermissionsWithStatus(userId);
  }

  /**
   * Ensure the permission catalog exists in the DB.
   * Idempotent — safe to run on every startup.
   */
  async seedPermissions() {
    const results = await this.managementPrisma.$transaction(
      ALL_PERMISSIONS.map((p) =>
        this.managementPrisma.permission.upsert({
          where: {
            resource_action: {
              resource: p.resource,
              action: p.action as PermissionAction,
            },
          },
          create: {
            resource: p.resource,
            action: p.action as PermissionAction,
            description: p.description,
          },
          update: {
            description: p.description,
            is_active: true,
          },
        }),
      ),
    );

    const keyToId = new Map<string, number>();
    for (const p of results) {
      keyToId.set(buildPermissionKey(p.resource, p.action), p.s_no);
    }

    return keyToId;
  }

  /**
   * Ensure the 5 default admin roles exist and have the default permission sets.
   * Idempotent — safe to run on every startup.
   */
  async seedRolesAndAssignments() {
    const keyToId = await this.seedPermissions();

    const roles = await this.managementPrisma.$transaction(
      Object.keys(DEFAULT_ROLE_PERMISSIONS).map((roleName) =>
        this.managementPrisma.role.upsert({
          where: { name: roleName },
          create: {
            name: roleName,
            description: DEFAULT_ROLE_DESCRIPTIONS[roleName] ?? null,
            is_active: true,
            is_system: true,
          },
          update: {
            description: DEFAULT_ROLE_DESCRIPTIONS[roleName] ?? undefined,
            is_active: true,
            is_system: true,
          },
        }),
      ),
    );

    for (const role of roles) {
      const keys = DEFAULT_ROLE_PERMISSIONS[role.name] ?? [];
      const permissionIds = keys
        .map((k) => keyToId.get(k))
        .filter((id): id is number => id !== undefined);

      await this.managementPrisma.$transaction(async (tx) => {
        await tx.role_permission.deleteMany({ where: { role_id: role.s_no } });
        if (permissionIds.length > 0) {
          await tx.role_permission.createMany({
            data: permissionIds.map((permissionId) => ({
              role_id: role.s_no,
              permission_id: permissionId,
            })),
            skipDuplicates: true,
          });
        }
      });
    }

    this.logger.log(`Seeded ${ALL_PERMISSIONS.length} permissions and ${roles.length} roles.`);
    return roles;
  }

  private async resolvePermissionIds(keys: string[]): Promise<number[]> {
    const parsed = keys.map((k) => ({ key: k, parsed: parsePermissionKey(k) })).filter((x) => x.parsed != null);

    const permissions = await this.managementPrisma.permission.findMany({
      where: {
        OR: parsed.map(({ parsed: p }) => ({
          AND: [{ resource: p.resource }, { action: p.action as PermissionAction }],
        })),
      },
    });

    const foundKeyToId = new Map<string, number>();
    for (const p of permissions) {
      foundKeyToId.set(buildPermissionKey(p.resource, p.action), p.s_no);
    }

    return parsed
      .map(({ key }) => foundKeyToId.get(key))
      .filter((id): id is number => id !== undefined);
  }
}
