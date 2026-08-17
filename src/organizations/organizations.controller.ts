import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards, Body, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'List organizations with PG and resource counts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Organizations fetched successfully' })
  async listOrganizations(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('deleted') deleted?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    const deletedOnly = deleted === 'true' || deleted === '1';
    return this.organizationsService.listOrganizations({
      page: pageNumber,
      limit: limitNumber,
      search: search || undefined,
      status: status || undefined,
      sortBy: sortBy || undefined,
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined,
      deleted: deletedOnly,
    });
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'Get organization details with per-PG counts' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Organization fetched successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganizationDetails(@Param('id', ParseIntPipe) id: number) {
    return this.organizationsService.getOrganizationDetails(id);
  }

  @Get(':orgId/pg/:pgId')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'Get PG location details with rooms, beds, tenants, and employees' })
  @ApiParam({ name: 'orgId', type: Number })
  @ApiParam({ name: 'pgId', type: Number })
  @ApiResponse({ status: 200, description: 'PG details fetched successfully' })
  @ApiResponse({ status: 404, description: 'PG location not found' })
  async getPgDetails(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('pgId', ParseIntPipe) pgId: number,
  ) {
    return this.organizationsService.getPgDetails(orgId, pgId);
  }

  @Post(':id/reactivate')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.UPDATE))
  @ApiOperation({ summary: 'Reactivate a deleted/inactive organization and its super admin' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Organization reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async reactivateOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.organizationsService.reactivateOrganization(id);
  }

  @Post(':id/delete')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.DELETE))
  @ApiOperation({ summary: 'Soft delete an active organization and its super admin' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Organization deleted successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async deleteOrganization(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body('reason') reason?: string,
  ) {
    const adminUserId = req?.validatedHeaders?.user_id;
    return this.organizationsService.deleteOrganization(id, adminUserId, reason);
  }
}
