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
  @ApiResponse({ status: 200, description: 'Organizations fetched successfully' })
  async listOrganizations(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    console.log("hellow testing")
    return this.organizationsService.listOrganizations({
      page: pageNumber,
      limit: limitNumber,
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
}
