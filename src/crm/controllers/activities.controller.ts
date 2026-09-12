import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ContactAccess, CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm')
export class ActivitiesController {
  constructor(private readonly crm: CrmService) {}

  private getAccess(req: Request): ContactAccess {
    const user = req.user!;
    return {
      userId: Number(user.sub),
      organizationId: user.organization_id ? Number(user.organization_id) : null,
      isSuperAdmin: user.role?.toUpperCase() === 'SUPER_ADMIN',
    };
  }

  @Get('leads/:id/activities')
  async list(@Param('id') id: string, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.listActivities(Number(id), this.getAccess(req)));
  }

  @Post('leads/:id/activities')
  async create(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ResponseUtil.created(await this.crm.createActivity(Number(id), body, this.getAccess(req)), 'Activity created');
  }

  @Patch('activities/:id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.updateActivity(Number(id), body, this.getAccess(req)));
  }

  @Delete('activities/:id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    return ResponseUtil.success(await this.crm.deleteActivity(Number(id), this.getAccess(req)));
  }
}
