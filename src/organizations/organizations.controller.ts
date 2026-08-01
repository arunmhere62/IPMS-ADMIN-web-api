import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
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
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.organizationsService.listOrganizations({
      page: pageNumber,
      limit: limitNumber,
      search: search || undefined,
      status: status || undefined,
      sortBy: sortBy || undefined,
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details with per-PG counts' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Organization fetched successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganizationDetails(@Param('id', ParseIntPipe) id: number) {
    return this.organizationsService.getOrganizationDetails(id);
  }

  @Get(':orgId/pg/:pgId')
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
}
