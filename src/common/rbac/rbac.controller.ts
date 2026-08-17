import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RbacService } from './rbac.service';
import { ManagementPrismaService } from '../../prisma/management-prisma.service';
import { RequirePermission } from './require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from './permissions.catalog';
import { ResponseUtil } from '../utils/response.util';

@ApiTags('rbac')
@Controller('rbac')
@ApiBearerAuth()
export class RbacController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly managementPrisma: ManagementPrismaService,
  ) {}

  private getUserId(req: Request): number {
    const userId = (req as any).user?.sub;
    if (!userId || !Number.isFinite(Number(userId))) {
      throw new ForbiddenException('User identity not available');
    }
    return Number(userId);
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Get current user effective permissions' })
  async getMyPermissions(@Req() req: Request) {
    const userId = this.getUserId(req);
    const result = await this.rbacService.getUserPermissionsWithStatus(userId);
    return ResponseUtil.success(result, 'User permissions fetched successfully');
  }

  @Get('roles')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'List all roles from management DB (for user assignment)' })
  async listRoles() {
    const roles = await this.managementPrisma.role.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: { s_no: true, name: true, description: true, is_system: true },
    });
    return ResponseUtil.success(roles, 'Roles fetched successfully');
  }

  @Get('permissions')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'List all permissions in the catalog' })
  async getAllPermissions() {
    const permissions = await this.managementPrisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
    return ResponseUtil.success(permissions, 'Permissions fetched successfully');
  }

  @Get('roles/:roleId/permissions')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'Get permissions for a role' })
  async getRolePermissions(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.rbacService.getRolePermissionsWithStatus(roleId);
  }

  @Post('roles/:roleId/permissions')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Set permissions for a role (replace all)' })
  async setRolePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: { permissions: string[] },
  ) {
    return this.rbacService.setRolePermissions(roleId, body.permissions ?? []);
  }

  @Post('users/:userId/permissions/:key')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Add or update a user permission override' })
  async setUserOverride(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('key') key: string,
    @Body() body: { granted: boolean; reason?: string },
  ) {
    return this.rbacService.setUserPermissionOverride(userId, key, body.granted, body.reason);
  }

  @Delete('users/:userId/permissions/:key')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Remove a user permission override' })
  async removeUserOverride(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('key') key: string,
  ) {
    return this.rbacService.removeUserPermissionOverride(userId, key);
  }
}
