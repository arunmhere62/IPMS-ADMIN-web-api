import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SubscriptionPlansService } from './subscription-plans.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('subscription-plans')
@Controller('subscription-plans')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class SubscriptionPlansController {
  constructor(private readonly service: SubscriptionPlansService) {}

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTION_PLANS.CREATE))
  @ApiOperation({ summary: 'Create subscription plan' })
  @ApiResponse({ status: 201, description: 'Subscription plan created successfully' })
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTION_PLANS.VIEW))
  @ApiOperation({ summary: 'List subscription plans' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Subscription plans fetched successfully' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('is_active') is_active?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;

    const isActiveValue =
      typeof is_active === 'string' ? (is_active === 'true' ? true : is_active === 'false' ? false : undefined) : undefined;

    return this.service.findAll({
      page: pageNumber,
      limit: limitNumber,
      is_active: isActiveValue,
    });
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTION_PLANS.VIEW))
  @ApiOperation({ summary: 'Get subscription plan by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Subscription plan fetched successfully' })
  @ApiResponse({ status: 404, description: 'Subscription plan not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTION_PLANS.UPDATE))
  @ApiOperation({ summary: 'Update subscription plan' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Subscription plan updated successfully' })
  @ApiResponse({ status: 404, description: 'Subscription plan not found' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTION_PLANS.DELETE))
  @ApiOperation({ summary: 'Deactivate subscription plan (sets is_active=false)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Subscription plan deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Subscription plan not found' })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.service.deactivate(id);
  }
}
