import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ContactAccess, CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../../common/rbac/permissions.catalog';

@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly crm: CrmService) {}

  private getAccess(req: Request): ContactAccess {
    if (!req.user?.sub) throw new UnauthorizedException('User identity not available');
    return {
      userId: Number(req.user.sub),
      organizationId: req.user.organization_id ? Number(req.user.organization_id) : null,
      isSuperAdmin: req.user.role?.toUpperCase() === 'SUPER_ADMIN',
    };
  }

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
  async list(@Query() q: any, @Req() req: Request) {
    const [items, total] = await this.crm.listLeads(q, this.getAccess(req));
    return ResponseUtil.paginated(items, total, Number(q.page ?? 1), Number(q.limit ?? 20));
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
  async get(@Param('id') id: string, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.getLead(Number(id), this.getAccess(req)));
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.UPDATE))
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.updateLead(Number(id), body, this.getAccess(req)), 'Lead updated');
  }

  @Patch(':id/stage')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.UPDATE))
  async updateStage(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.updateLeadStage(Number(id), body?.stage, this.getAccess(req)), 'Lead stage updated');
  }

  @Delete(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.DELETE))
  async remove(@Param('id') id: string, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.softDeleteLead(Number(id), this.getAccess(req)), 'Lead deleted');
  }

  @Get(':id/activities')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
  async listActivities(@Param('id') id: string, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.listActivities(Number(id), this.getAccess(req)));
  }

  @Post(':id/activities')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.CREATE))
  async createActivity(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ResponseUtil.created(await this.crm.createActivity(Number(id), body, this.getAccess(req)), 'Activity created');
  }

  @Post(':id/convert-subscriber')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.MANAGE))
  async convert(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ResponseUtil.created(await this.crm.convertLeadToSubscriber(Number(id), body, this.getAccess(req)), 'Converted to subscriber');
  }
}
