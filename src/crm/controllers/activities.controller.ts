import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm')
export class ActivitiesController {
  constructor(private readonly crm: CrmService) {}

  @Get('leads/:id/activities')
  async list(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.listActivities(Number(id)));
  }

  @Post('leads/:id/activities')
  async create(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.created(await this.crm.createActivity(Number(id), body), 'Activity created');
  }
}
