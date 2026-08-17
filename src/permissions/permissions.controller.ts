import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { BulkUpsertPermissionsDto } from './dto/bulk-permissions.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'List permissions' })
  @ApiResponse({ status: 200, description: 'Permissions fetched successfully' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'Get permission by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Permission fetched successfully' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Create permission' })
  @ApiResponse({ status: 201, description: 'Permission created successfully' })
  create(@Body() dto: CreatePermissionDto) {
    return this.service.create(dto);
  }

  @Post('bulk')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Bulk upsert permissions for a screen' })
  @ApiResponse({ status: 200, description: 'Permissions upserted successfully' })
  bulkUpsert(@Body() dto: BulkUpsertPermissionsDto) {
    return this.service.bulkUpsert(dto);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Update permission' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Permission updated successfully' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePermissionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Delete permission (hard delete)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 204, description: 'Permission deleted successfully' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
