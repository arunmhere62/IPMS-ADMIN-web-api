import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { CreateVersionDto } from './dto/create-version.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';

@ApiTags('app-settings')
@Controller('app-settings')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  // ─── App Settings ───

  @Get()
  @ApiOperation({ summary: 'Get app settings (maintenance mode, versions, announcements)' })
  async getAppSettings() {
    return this.appSettingsService.getAppSettings();
  }

  @Patch()
  @ApiOperation({ summary: 'Update app settings' })
  async updateAppSettings(@Body() dto: UpdateAppSettingsDto, @Req() req: any) {
    const userId = req.validatedHeaders?.user_id;
    return this.appSettingsService.updateAppSettings(dto, userId);
  }

  // ─── Version History ───

  @Get('versions')
  @ApiOperation({ summary: 'List all app versions with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'platform', required: false, enum: ['ANDROID', 'IOS', 'BOTH', 'all'] })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async listVersions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.appSettingsService.listVersions({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      platform: platform || undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('versions/:id')
  @ApiOperation({ summary: 'Get a specific version by ID' })
  async getVersion(@Param('id', ParseIntPipe) id: number) {
    return this.appSettingsService.getVersionById(id);
  }

  @Post('versions')
  @ApiOperation({ summary: 'Create a new app version entry' })
  async createVersion(@Body() dto: CreateVersionDto, @Req() req: any) {
    const userId = req.validatedHeaders?.user_id;
    return this.appSettingsService.createVersion(dto, userId);
  }

  @Patch('versions/:id')
  @ApiOperation({ summary: 'Update an app version entry' })
  async updateVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVersionDto,
    @Req() req: any,
  ) {
    const userId = req.validatedHeaders?.user_id;
    return this.appSettingsService.updateVersion(id, dto, userId);
  }

  @Delete('versions/:id')
  @ApiOperation({ summary: 'Delete an app version entry' })
  async deleteVersion(@Param('id', ParseIntPipe) id: number) {
    return this.appSettingsService.deleteVersion(id);
  }

  // ─── Activity Logs (read-only) ───

  @Get('activity-logs')
  @ApiOperation({ summary: 'List activity logs with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action_type', required: false, type: String })
  @ApiQuery({ name: 'user_id', required: false, type: Number })
  @ApiQuery({ name: 'tenant_id', required: false, type: Number })
  @ApiQuery({ name: 'organization_id', required: false, type: Number })
  @ApiQuery({ name: 'pg_id', required: false, type: Number })
  async getActivityLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action_type') action_type?: string,
    @Query('user_id') user_id?: string,
    @Query('tenant_id') tenant_id?: string,
    @Query('organization_id') organization_id?: string,
    @Query('pg_id') pg_id?: string,
  ) {
    return this.appSettingsService.getActivityLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      action_type: action_type || undefined,
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      tenant_id: tenant_id ? parseInt(tenant_id, 10) : undefined,
      organization_id: organization_id ? parseInt(organization_id, 10) : undefined,
      pg_id: pg_id ? parseInt(pg_id, 10) : undefined,
    });
  }

  @Get('activity-stats')
  @ApiOperation({ summary: 'Get aggregated activity stats' })
  async getActivityStats() {
    return this.appSettingsService.getActivityStats();
  }

  // ─── Filter Data (for dropdowns) ───

  @Get('filters/organizations')
  @ApiOperation({ summary: 'List organizations for filter dropdown' })
  async listOrganizationsForFilter() {
    return this.appSettingsService.listOrganizationsForFilter();
  }

  @Get('filters/pg-locations')
  @ApiOperation({ summary: 'List PG locations for filter dropdown' })
  @ApiQuery({ name: 'organization_id', required: false, type: Number })
  async listPgLocationsForFilter(
    @Query('organization_id') organization_id?: string,
  ) {
    return this.appSettingsService.listPgLocationsForFilter(
      organization_id ? parseInt(organization_id, 10) : undefined,
    );
  }
}
