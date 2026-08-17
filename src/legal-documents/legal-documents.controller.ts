import { Body, Controller, Patch, Post, Query, Get, Param, ParseBoolPipe, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateLegalDocumentDto } from './dto/create-legal-document.dto';
import { UpdateLegalDocumentDto } from './dto/update-legal-document.dto';
import { LegalDocumentsService } from './legal-documents.service';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../common/decorators/validated-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('legal-documents')
@Controller('legal-documents')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class LegalDocumentsController {
  constructor(private readonly service: LegalDocumentsService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.LEGAL_DOCUMENTS.VIEW))
  @ApiOperation({ summary: 'List legal documents' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiQuery({ name: 'required_only', required: false, type: Boolean })
  @ApiQuery({ name: 'organization_id', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Legal documents fetched successfully' })
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('is_active') is_active?: string,
    @Query('required_only') required_only?: string,
    @Query('organization_id') organization_id?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;

    const isActiveValue =
      typeof is_active === 'string' ? (is_active === 'true' ? true : is_active === 'false' ? false : undefined) : undefined;

    const requiredOnly = required_only === 'true';
    const orgId = organization_id ? parseInt(organization_id, 10) : undefined;

    return this.service.list({
      page: pageNumber,
      limit: limitNumber,
      type,
      is_active: isActiveValue,
      required_only: requiredOnly,
      organization_id: orgId,
    });
  }

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.LEGAL_DOCUMENTS.CREATE))
  @ApiOperation({ summary: 'Create legal document' })
  @ApiResponse({ status: 201, description: 'Legal document created successfully' })
  create(@Body() dto: CreateLegalDocumentDto, @ValidatedHeaders() headers: { user_id?: number }) {
    return this.service.create(dto, headers.user_id);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.LEGAL_DOCUMENTS.UPDATE))
  @ApiOperation({ summary: 'Update legal document' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Legal document updated successfully' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLegalDocumentDto,
    @ValidatedHeaders() headers: { user_id?: number },
  ) {
    return this.service.update(id, dto, headers.user_id);
  }

  @Patch(':id/active')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.LEGAL_DOCUMENTS.UPDATE))
  @ApiOperation({ summary: 'Activate/deactivate legal document' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'value', required: true, type: Boolean })
  @ApiResponse({ status: 200, description: 'Legal document status updated successfully' })
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Query('value', ParseBoolPipe) value: boolean,
    @ValidatedHeaders() headers: { user_id?: number },
  ) {
    return this.service.setActive(id, value, headers.user_id);
  }
}
