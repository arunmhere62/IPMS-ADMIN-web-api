import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, BadRequestException } from '@nestjs/common';
import { GoogleLeadsService } from '../google-leads.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { ManagementPrismaService } from '../../prisma/management-prisma.service';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../../common/rbac/permissions.catalog';

@Controller('crm/google-leads')
export class GoogleLeadsController {
  constructor(
    private readonly googleLeads: GoogleLeadsService,
    private readonly prisma: ManagementPrismaService,
  ) {}

  /**
   * Search Google Places API (New) for PG/hostel businesses.
   * Uses cache: same query+maxPages returns cached results (zero API cost).
   */
  @Get('search')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async search(
    @Query('q') q: string,
    @Query('maxPages') maxPages?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('phoneOnly') phoneOnly?: string,
  ) {
    if (!q || !q.trim()) {
      throw new BadRequestException('Search query (q) is required');
    }
    const pages = Math.min(Math.max(Number(maxPages ?? '1'), 1), 8);
    const refresh = forceRefresh === 'true' || forceRefresh === '1';
    const phone = phoneOnly === 'true' || phoneOnly === '1';
    const result = await this.googleLeads.searchGoogleLeads(q.trim(), pages, refresh, undefined, phone);
    return ResponseUtil.success(result);
  }

  /**
   * Sweep an area with multiple keywords and return merged/deduped results.
   */
  @Post('sweep')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async sweep(@Body() body: any) {
    if (!body.area || !body.area.trim()) {
      throw new BadRequestException('area is required');
    }
    if (!body.keywords || !Array.isArray(body.keywords) || body.keywords.length === 0) {
      throw new BadRequestException('keywords array is required');
    }
    const pages = Math.min(Math.max(Number(body.maxPages ?? '8'), 1), 8);
    const phone = body.phoneOnly === true || body.phoneOnly === 'true' || body.phoneOnly === '1';
    const result = await this.googleLeads.sweepGoogleLeads(
      body.area,
      body.keywords,
      pages,
      phone,
      body.searchedBy,
    );
    return ResponseUtil.success(result);
  }

  /**
   * Get search history — shows all previously searched queries.
   */
  @Get('history')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async history(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = Math.max(1, Number(page ?? 1));
    const l = Math.min(50, Math.max(1, Number(limit ?? 20)));
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.crm_google_search_cache.findMany({
        orderBy: { created_at: 'desc' },
        skip: (p - 1) * l,
        take: l,
        select: {
          s_no: true,
          query: true,
          max_pages: true,
          total: true,
          new_count: true,
          api_calls: true,
          searched_by: true,
          created_at: true,
        },
      }),
      this.prisma.crm_google_search_cache.count(),
    ]);
    return ResponseUtil.paginated(rows, total, p, l);
  }

  /**
   * Import selected Google Places results into crm_contacts.
   */
  @Post('import')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.MANAGE))
  async import(@Body() body: any) {
    if (!body.leads || !Array.isArray(body.leads) || body.leads.length === 0) {
      throw new BadRequestException('leads array is required');
    }
    const result = await this.googleLeads.importGoogleLeads(body.leads, body.importedBy);
    const parts: string[] = [];
    if (result.imported > 0) parts.push(`Imported ${result.imported} contacts`);
    if (result.skipped_duplicates > 0) parts.push(`${result.skipped_duplicates} duplicates skipped`);
    if (result.skipped_no_phone > 0) parts.push(`${result.skipped_no_phone} without phone skipped`);
    if (result.failed > 0) parts.push(`${result.failed} failed`);
    if (result.imported === 0 && result.skipped_duplicates === 0 && result.failed === 0) {
      parts.push('No contacts processed');
    }
    return ResponseUtil.success(result, parts.join(', '));
  }

  /**
   * Get cities + areas + keywords for search dropdowns.
   * Uses existing consumer city table + distinct area values from crm_contacts.
   */
  @Get('areas')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async listAreas() {
    const data = await this.googleLeads.listSearchAreas();
    return ResponseUtil.success(data);
  }

  /**
   * Get areas for a specific city.
   * Combines consumer pg_locations, crm_contacts area values, and india-pincode data.
   */
  @Get('areas/:cityId')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async listAreasByCity(@Param('cityId', ParseIntPipe) cityId: number) {
    const data = await this.googleLeads.listSearchAreasByCity(cityId);
    return ResponseUtil.success(data);
  }

  /**
   * Get states for the initial dropdown.
   */
  @Get('states')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async listStates() {
    const data = await this.googleLeads.listSearchStates();
    return ResponseUtil.success(data);
  }

  /**
   * Get cities for a selected state.
   */
  @Get('cities')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async listCities(@Query('stateCode') stateCode?: string) {
    const data = await this.googleLeads.listSearchCities(stateCode);
    return ResponseUtil.success(data);
  }

  // ─── Keyword Management ────────────────────────────────────────────────────

  @Get('keywords')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.VIEW))
  async listKeywords() {
    const keywords = await this.googleLeads.listSearchKeywords();
    return ResponseUtil.success(keywords);
  }

  @Post('keywords')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.CREATE))
  async createKeyword(@Body() body: any) {
    if (!body.keyword || !body.keyword.trim()) {
      throw new BadRequestException('Keyword is required');
    }
    const kw = await this.googleLeads.createSearchKeyword(body.keyword, body.sort_order);
    return ResponseUtil.created(kw, 'Keyword created');
  }

  @Post('keywords/seed')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.CREATE))
  async seedKeywords() {
    const result = await this.googleLeads.seedSearchKeywords();
    return ResponseUtil.success(result, `Seeded ${result.created} keywords, ${result.skipped} already existed`);
  }

  @Patch('keywords/:id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.UPDATE))
  async updateKeyword(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    const kw = await this.googleLeads.updateSearchKeyword(id, {
      keyword: body.keyword,
      is_active: body.is_active,
      sort_order: body.sort_order,
    });
    return ResponseUtil.success(kw, 'Keyword updated');
  }

  @Delete('keywords/:id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_GOOGLE_LEADS.DELETE))
  async deleteKeyword(@Param('id', ParseIntPipe) id: number) {
    await this.googleLeads.deleteSearchKeyword(id);
    return ResponseUtil.success(null, 'Keyword deleted');
  }
}
