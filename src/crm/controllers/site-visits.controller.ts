import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm')
export class SiteVisitsController {
  constructor(private readonly crm: CrmService) {}

  @Get('site-visits')
  async list(@Query() q: any) {
    const [items, total] = await this.crm.listSiteVisits(q);
    return ResponseUtil.paginated(items as any[], total, Number(q.page ?? 1), Number(q.limit ?? 20));
  }

  @Post('contacts/:id/site-visits')
  async schedule(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.created(await this.crm.scheduleVisit(Number(id), body), 'Visit scheduled');
  }

  @Patch('site-visits/:id')
  async update(@Param('id') id: string, @Body() body: any) {
    return ResponseUtil.success(await this.crm.updateVisit(Number(id), body), 'Visit updated');
  }
}
