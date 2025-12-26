import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { AssignPermissionsDto, BulkPermissionUpdateDto } from './dto/assign-permissions.dto';

@Injectable()
export class RolePermissionsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  private buildPermissionKey(screenName: string, action: string) {
    return `${screenName}_${action.toLowerCase()}`;
  }

  private parsePermissionKey(key: string) {
    const idx = key.lastIndexOf('_');
    if (idx <= 0 || idx === key.length - 1) return null;
    const screen_name = key.slice(0, idx);
    const action = key.slice(idx + 1);
    if (!screen_name || !action) return null;
    return { screen_name, action: action.toUpperCase() };
  }

  private async resolvePermissionsFromKeys(permissionKeys: string[]) {
    const parsed = permissionKeys
      .map((k) => ({ key: k, parsed: this.parsePermissionKey(k) }))
      .filter((x) => x.parsed != null) as Array<{ key: string; parsed: { screen_name: string; action: string } }>;

    if (parsed.length !== permissionKeys.length) {
      const invalid = permissionKeys.filter((k) => this.parsePermissionKey(k) == null);
      throw new BadRequestException(`Invalid permission keys: ${invalid.join(', ')}`);
    }

    const permissions = await this.consumerPrisma.permissions_master.findMany({
      where: {
        OR: parsed.map(({ parsed: p }) => ({
          AND: [{ screen_name: p.screen_name }, { action: p.action as any }],
        })),
      },
    });

    const foundKeyToId = new Map<string, number>();
    for (const p of permissions) {
      foundKeyToId.set(this.buildPermissionKey(p.screen_name, p.action as any), p.s_no);
    }

    const missingKeys = permissionKeys.filter((k) => !foundKeyToId.has(k));
    if (missingKeys.length > 0) {
      throw new BadRequestException(`Permission keys not found: ${missingKeys.join(', ')}`);
    }

    return {
      permissions,
      permissionIds: permissionKeys.map((k) => foundKeyToId.get(k) as number),
    };
  }

  async assignPermissions(roleId: number, dto: AssignPermissionsDto) {
    const role = await this.consumerPrisma.roles.findFirst({
      where: { s_no: roleId, is_deleted: false },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const { permissionIds } = await this.resolvePermissionsFromKeys(dto.permission_keys);

    if (dto.replace_all) {
      await this.consumerPrisma.role_permissions.deleteMany({
        where: { role_id: roleId },
      });
    }

    await this.consumerPrisma.role_permissions.createMany({
      data: permissionIds.map((permissionId) => ({
        role_id: roleId,
        permission_id: permissionId,
      })),
      skipDuplicates: true,
    });

    const updatedRole = await this.consumerPrisma.roles.findUnique({ where: { s_no: roleId } });
    return ResponseUtil.success(updatedRole, 'Permissions assigned successfully');
  }

  async removePermissions(roleId: number, permissionKeys: string[]) {
    const role = await this.consumerPrisma.roles.findFirst({
      where: { s_no: roleId, is_deleted: false },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const { permissionIds } = await this.resolvePermissionsFromKeys(permissionKeys);

    await this.consumerPrisma.role_permissions.deleteMany({
      where: {
        role_id: roleId,
        permission_id: { in: permissionIds },
      },
    });

    const updatedRole = await this.consumerPrisma.roles.findUnique({ where: { s_no: roleId } });
    return ResponseUtil.success(updatedRole, 'Permissions removed successfully');
  }

  async bulkUpdatePermissions(roleId: number, dto: BulkPermissionUpdateDto) {
    const role = await this.consumerPrisma.roles.findFirst({
      where: { s_no: roleId, is_deleted: false },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permissionKeys = Object.keys(dto.permissions);
    const selectedKeys = permissionKeys.filter((k) => dto.permissions[k] === true);
    const { permissionIds } = await this.resolvePermissionsFromKeys(selectedKeys);

    await this.consumerPrisma.role_permissions.deleteMany({
      where: { role_id: roleId },
    });

    if (permissionIds.length > 0) {
      await this.consumerPrisma.role_permissions.createMany({
        data: permissionIds.map((permissionId) => ({
          role_id: roleId,
          permission_id: permissionId,
        })),
        skipDuplicates: true,
      });
    }

    const updatedRole = await this.consumerPrisma.roles.findUnique({ where: { s_no: roleId } });
    return ResponseUtil.success(updatedRole, 'Permissions updated successfully');
  }

  async getRolePermissions(roleId: number) {
    const role = await this.consumerPrisma.roles.findFirst({
      where: { s_no: roleId, is_deleted: false },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const [allPermissions, rolePermissionRows] = await Promise.all([
      this.consumerPrisma.permissions_master.findMany({
        orderBy: [{ screen_name: 'asc' }, { action: 'asc' }],
      }),
      this.consumerPrisma.role_permissions.findMany({
        where: { role_id: roleId },
        select: { permission_id: true },
      }),
    ]);

    const grantedPermissionIds = new Set(rolePermissionRows.map((r) => r.permission_id));

    const permissionsWithStatus = allPermissions.map((permission) => ({
      ...permission,
      granted: grantedPermissionIds.has(permission.s_no),
    }));

    return ResponseUtil.success(
      {
        role: {
          s_no: role.s_no,
          role_name: role.role_name,
          status: role.status,
        },
        permissions: permissionsWithStatus,
        summary: {
          total_permissions: allPermissions.length,
          granted_permissions: grantedPermissionIds.size,
        },
      },
      'Role permissions fetched successfully',
    );
  }

  async copyPermissions(sourceRoleId: number, targetRoleId: number) {
    const [sourceRole, targetRole] = await Promise.all([
      this.consumerPrisma.roles.findFirst({ where: { s_no: sourceRoleId, is_deleted: false } }),
      this.consumerPrisma.roles.findFirst({ where: { s_no: targetRoleId, is_deleted: false } }),
    ]);

    if (!sourceRole) {
      throw new NotFoundException('Source role not found');
    }

    if (!targetRole) {
      throw new NotFoundException('Target role not found');
    }

    const sourceRows = await this.consumerPrisma.role_permissions.findMany({
      where: { role_id: sourceRoleId },
      select: { permission_id: true },
    });

    await this.consumerPrisma.role_permissions.deleteMany({
      where: { role_id: targetRoleId },
    });

    if (sourceRows.length > 0) {
      await this.consumerPrisma.role_permissions.createMany({
        data: sourceRows.map((r) => ({
          role_id: targetRoleId,
          permission_id: r.permission_id,
        })),
        skipDuplicates: true,
      });
    }

    const updatedRole = await this.consumerPrisma.roles.findUnique({ where: { s_no: targetRoleId } });
    return ResponseUtil.success(updatedRole, `Permissions copied from ${sourceRole.role_name} to ${targetRole.role_name}`);
  }

  async getPermissionUsage(permissionKey?: string) {
    if (permissionKey) {
      const parsed = this.parsePermissionKey(permissionKey);
      if (!parsed) {
        throw new BadRequestException(`Invalid permission key: ${permissionKey}`);
      }

      const permission = await this.consumerPrisma.permissions_master.findFirst({
        where: {
          screen_name: parsed.screen_name,
          action: parsed.action as any,
        },
      });

      if (!permission) {
        throw new BadRequestException(`Permission key not found: ${permissionKey}`);
      }

      const rolesUsing = await this.consumerPrisma.role_permissions.findMany({
        where: { permission_id: permission.s_no },
        select: {
          roles: {
            select: {
              s_no: true,
              role_name: true,
              _count: { select: { users: true } },
            },
          },
        },
      });

      const normalizedRoles = rolesUsing.map((r) => r.roles);
      return ResponseUtil.success(
        {
          permission_key: permissionKey,
          roles_using: normalizedRoles,
          total_roles: normalizedRoles.length,
          total_users_affected: normalizedRoles.reduce((sum, role) => sum + role._count.users, 0),
        },
        'Permission usage fetched successfully',
      );
    }

    const [allPermissions, allRolePerms] = await Promise.all([
      this.consumerPrisma.permissions_master.findMany({
        orderBy: [{ screen_name: 'asc' }, { action: 'asc' }],
      }),
      this.consumerPrisma.role_permissions.findMany({
        select: {
          role_id: true,
          permission_id: true,
          roles: {
            select: {
              s_no: true,
              role_name: true,
              _count: { select: { users: true } },
            },
          },
        },
      }),
    ]);

    const rolesByPermission = new Map<number, Array<{ s_no: number; role_name: string; users_count: number }>>();
    for (const rp of allRolePerms) {
      const arr = rolesByPermission.get(rp.permission_id) ?? [];
      arr.push({
        s_no: rp.roles.s_no,
        role_name: rp.roles.role_name,
        users_count: rp.roles._count.users,
      });
      rolesByPermission.set(rp.permission_id, arr);
    }

    const usageMap = allPermissions.map((permission) => {
      const roles = rolesByPermission.get(permission.s_no) ?? [];
      return {
        permission_key: this.buildPermissionKey(permission.screen_name, permission.action as any),
        screen_name: permission.screen_name,
        action: permission.action,
        description: permission.description,
        roles_count: roles.length,
        users_affected: roles.reduce((sum, r) => sum + r.users_count, 0),
        roles,
      };
    });

    return ResponseUtil.success(usageMap, 'Permission usage fetched successfully');
  }
}
