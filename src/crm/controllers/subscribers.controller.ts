import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm/subscribers')
export class SubscribersController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  async list(@Query() q: any) {
    const [items, total] = await this.crm.listSubscribers(q);
    return ResponseUtil.paginated(items as any[], total, Number(q.page ?? 1), Number(q.limit ?? 20));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ResponseUtil.success(await this.crm.getSubscriber(Number(id)));
  }
}
