import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { CreateVersionDto } from './dto/create-version.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

@Injectable()
export class AppSettingsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  // ─── App Settings (single row) ───

  async getAppSettings() {
    let settings = await this.consumerPrisma.app_settings.findFirst();
    if (!settings) {
      settings = await this.consumerPrisma.app_settings.create({
        data: {},
      });
    }
    return ResponseUtil.success(settings);
  }

  async updateAppSettings(dto: UpdateAppSettingsDto, userId: number) {
    let settings = await this.consumerPrisma.app_settings.findFirst();
    if (!settings) {
      settings = await this.consumerPrisma.app_settings.create({
        data: { ...dto, updated_by: userId },
      });
      return ResponseUtil.success(settings, 'App settings created');
    }
    const updated = await this.consumerPrisma.app_settings.update({
      where: { s_no: settings.s_no },
      data: { ...dto, updated_by: userId },
    });
    return ResponseUtil.success(updated, 'App settings updated');
  }

  // ─── Version History ───

  async listVersions(params: {
    page: number;
    limit: number;
    platform?: string;
    isActive?: boolean;
  }) {
    const { page, limit, platform, isActive } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (platform && platform !== 'all') {
      where.platform = platform;
    }
    if (isActive !== undefined) {
      where.is_active = isActive;
    }

    const [items, total] = await Promise.all([
      this.consumerPrisma.app_version_history.findMany({
        where,
        orderBy: { released_at: 'desc' },
        skip,
        take: limit,
      }),
      this.consumerPrisma.app_version_history.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit);
  }

  async getVersionById(id: number) {
    const version = await this.consumerPrisma.app_version_history.findUnique({
      where: { s_no: id },
    });
    if (!version) {
      throw new NotFoundException(`Version with ID ${id} not found`);
    }
    return ResponseUtil.success(version);
  }

  async createVersion(dto: CreateVersionDto, userId: number) {
    const version = await this.consumerPrisma.app_version_history.create({
      data: {
        ...dto,
        updated_by: userId,
      },
    });
    return ResponseUtil.created(version, 'Version created successfully');
  }

  async updateVersion(id: number, dto: UpdateVersionDto, userId: number) {
    const existing = await this.consumerPrisma.app_version_history.findUnique({
      where: { s_no: id },
    });
    if (!existing) {
      throw new NotFoundException(`Version with ID ${id} not found`);
    }
    const updated = await this.consumerPrisma.app_version_history.update({
      where: { s_no: id },
      data: { ...dto, updated_by: userId },
    });
    return ResponseUtil.success(updated, 'Version updated successfully');
  }

  async deleteVersion(id: number) {
    const existing = await this.consumerPrisma.app_version_history.findUnique({
      where: { s_no: id },
    });
    if (!existing) {
      throw new NotFoundException(`Version with ID ${id} not found`);
    }
    await this.consumerPrisma.app_version_history.delete({
      where: { s_no: id },
    });
    return ResponseUtil.success(null, 'Version deleted successfully');
  }

  // ─── Activity Logs (read-only from admin) ───

  async getActivityLogs(params: {
    page: number;
    limit: number;
    action_type?: string;
    user_id?: number;
    tenant_id?: number;
    organization_id?: number;
    pg_id?: number;
  }) {
    const { page, limit, action_type, user_id, tenant_id, organization_id, pg_id } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (action_type) where.action_type = action_type;
    if (user_id) where.user_id = user_id;
    if (tenant_id) where.tenant_id = tenant_id;

    // Filter by organization_id through users or tenants relation
    if (organization_id) {
      where.OR = [
        {
          users: { organization_id },
        },
        {
          tenants: { pg_locations: { organization_id } },
        },
      ];
    }

    // Filter by pg_id through users (pg_users) or tenants relation
    if (pg_id) {
      where.OR = [
        {
          users: { pg_users: { some: { pg_id } } },
        },
        {
          tenants: { pg_id },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.consumerPrisma.user_activity_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          users: {
            select: {
              s_no: true,
              name: true,
              phone: true,
              organization_id: true,
            },
          },
          tenants: {
            select: {
              s_no: true,
              name: true,
              phone_no: true,
              pg_id: true,
              pg_locations: {
                select: {
                  s_no: true,
                  location_name: true,
                  organization_id: true,
                },
              },
            },
          },
        },
      }),
      this.consumerPrisma.user_activity_logs.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit);
  }

  // ─── Filter Data (for dropdowns) ───

  async listOrganizationsForFilter() {
    const orgs = await this.consumerPrisma.organization.findMany({
      where: { is_deleted: false },
      select: {
        s_no: true,
        name: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });
    return ResponseUtil.success(orgs);
  }

  async listPgLocationsForFilter(organization_id?: number) {
    const where: any = { is_deleted: false };
    if (organization_id) {
      where.organization_id = organization_id;
    }
    const pgs = await this.consumerPrisma.pg_locations.findMany({
      where,
      select: {
        s_no: true,
        location_name: true,
        organization_id: true,
        organization: {
          select: { s_no: true, name: true },
        },
      },
      orderBy: { location_name: 'asc' },
    });
    return ResponseUtil.success(pgs);
  }

  async getActivityStats() {
    const [
      totalInstalls,
      totalLogins,
      totalOpenEvents,
      androidUsers,
      iosUsers,
      recentActivity,
    ] = await Promise.all([
      this.consumerPrisma.user_activity_logs.count({
        where: { action_type: 'APP_INSTALL' },
      }),
      this.consumerPrisma.user_activity_logs.count({
        where: { action_type: 'LOGIN' },
      }),
      this.consumerPrisma.user_activity_logs.count({
        where: { action_type: 'APP_OPEN' },
      }),
      this.consumerPrisma.user_activity_logs.count({
        where: { action_type: 'APP_INSTALL', device_model: { contains: 'Android' } },
      }),
      this.consumerPrisma.user_activity_logs.count({
        where: { action_type: 'APP_INSTALL', device_model: { contains: 'iOS' } },
      }),
      this.consumerPrisma.user_activity_logs.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
    ]);

    return ResponseUtil.success({
      total_installs: totalInstalls,
      total_logins: totalLogins,
      total_open_events: totalOpenEvents,
      android_users: androidUsers,
      ios_users: iosUsers,
      recent_activity: recentActivity,
    });
  }
}
