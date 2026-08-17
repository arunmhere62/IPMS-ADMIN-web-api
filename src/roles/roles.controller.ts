import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('roles')
@Controller('roles')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Create role' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'List roles' })
  @ApiResponse({ status: 200, description: 'Roles fetched successfully' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.VIEW))
  @ApiOperation({ summary: 'Get role by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Role fetched successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.RBAC.MANAGE))
  @ApiOperation({ summary: 'Soft delete role (sets is_deleted=true)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
