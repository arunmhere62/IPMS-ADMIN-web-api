import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm/lead-stages')
export class LeadStagesController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  async list(@Query('includeInactive') includeInactive?: string) {
    const stages = await this.crm.listLeadStages(includeInactive === 'true');
    return ResponseUtil.success(stages);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.getLeadStage(Number(id)));
  }

  @Post()
  async create(@Body() body: any) {
    const stage = await this.crm.createLeadStage(body);
    return ResponseUtil.created(stage, 'Lead stage created');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const stage = await this.crm.updateLeadStageConfig(Number(id), body);
    return ResponseUtil.success(stage, 'Lead stage updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const stage = await this.crm.deleteLeadStage(Number(id));
    return ResponseUtil.success(stage, 'Lead stage deleted');
  }
}
