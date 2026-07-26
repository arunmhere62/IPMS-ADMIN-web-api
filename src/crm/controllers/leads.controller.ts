import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  async list(@Query() q: any) {
    const [items, total] = await this.crm.listLeads(q);
    return ResponseUtil.paginated(items, total, Number(q.page ?? 1), Number(q.limit ?? 20));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.getLead(Number(id)));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.success(await this.crm.updateLead(Number(id), body), 'Lead updated');
  }

  @Patch(':id/stage')
  async updateStage(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.success(await this.crm.updateLeadStage(Number(id), body?.stage), 'Lead stage updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.softDeleteLead(Number(id)), 'Lead deleted');
  }

  @Get(':id/activities')
  async listActivities(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.listActivities(Number(id)));
  }

  @Post(':id/activities')
  async createActivity(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.created(await this.crm.createActivity(Number(id), body), 'Activity created');
  }

  @Post(':id/convert-subscriber')
  async convert(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.created(await this.crm.convertLeadToSubscriber(Number(id), body), 'Converted to subscriber');
  }
}
