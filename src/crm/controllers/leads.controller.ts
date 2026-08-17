import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../../common/rbac/permissions.catalog';

@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
  async list(@Query() q: any) {
    const [items, total] = await this.crm.listLeads(q);
    return ResponseUtil.paginated(items, total, Number(q.page ?? 1), Number(q.limit ?? 20));
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
  async get(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.getLead(Number(id)));
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.UPDATE))
  async update(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.success(await this.crm.updateLead(Number(id), body), 'Lead updated');
  }

  @Patch(':id/stage')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.UPDATE))
  async updateStage(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.success(await this.crm.updateLeadStage(Number(id), body?.stage), 'Lead stage updated');
  }

  @Delete(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.DELETE))
  async remove(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.softDeleteLead(Number(id)), 'Lead deleted');
  }

  @Get(':id/activities')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
  async listActivities(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.listActivities(Number(id)));
  }

  @Post(':id/activities')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.CREATE))
  async createActivity(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.created(await this.crm.createActivity(Number(id), body), 'Activity created');
  }

  @Post(':id/convert-subscriber')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.MANAGE))
  async convert(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.created(await this.crm.convertLeadToSubscriber(Number(id), body), 'Converted to subscriber');
  }
}
