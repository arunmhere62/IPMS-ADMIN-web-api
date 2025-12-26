import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolePermissionsService } from './role-permissions.service';
import { AssignPermissionsDto, BulkPermissionUpdateDto } from './dto/assign-permissions.dto';

@ApiTags('role-permissions')
@Controller('role-permissions')
export class RolePermissionsController {
  constructor(private readonly service: RolePermissionsService) {}

  @Post(':roleId/assign')
  @ApiOperation({ summary: 'Assign permissions to a role' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions assigned successfully' })
  assignPermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.service.assignPermissions(roleId, dto);
  }

  @Delete(':roleId/remove')
  @ApiOperation({ summary: 'Remove permissions from a role' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions removed successfully' })
  removePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: { permission_keys: string[] },
  ) {
    return this.service.removePermissions(roleId, body.permission_keys);
  }

  @Patch(':roleId/bulk-update')
  @ApiOperation({ summary: 'Bulk update role permissions' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions updated successfully' })
  bulkUpdatePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: BulkPermissionUpdateDto,
  ) {
    return this.service.bulkUpdatePermissions(roleId, dto);
  }

  @Get(':roleId')
  @ApiOperation({ summary: 'Get role permissions with details' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Role permissions retrieved successfully' })
  getRolePermissions(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.service.getRolePermissions(roleId);
  }

  @Post(':sourceRoleId/copy-to/:targetRoleId')
  @ApiOperation({ summary: 'Copy permissions from one role to another' })
  @ApiParam({ name: 'sourceRoleId', description: 'Source Role ID' })
  @ApiParam({ name: 'targetRoleId', description: 'Target Role ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions copied successfully' })
  copyPermissions(
    @Param('sourceRoleId', ParseIntPipe) sourceRoleId: number,
    @Param('targetRoleId', ParseIntPipe) targetRoleId: number,
  ) {
    return this.service.copyPermissions(sourceRoleId, targetRoleId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get permission usage across roles' })
  @ApiQuery({ name: 'permission_key', required: false, description: 'Specific permission key to check' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permission usage retrieved successfully' })
  getPermissionUsage(@Query('permission_key') permissionKey?: string) {
    return this.service.getPermissionUsage(permissionKey);
  }
}
