import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SubscriptionManagementService } from './subscription-management.service';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { UpdateUserSubscriptionStatusDto } from './dto/update-user-subscription-status.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('subscription-management')
@Controller('subscription-management')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class SubscriptionManagementController {
  constructor(private readonly service: SubscriptionManagementService) {}

  // ─── Payment endpoints ───

  @Get('payments')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTIONS.VIEW))
  @ApiOperation({ summary: 'List all subscription payments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['INITIATED', 'SUCCESS', 'FAILURE', 'ABORTED', 'PENDING'] })
  @ApiQuery({ name: 'payment_type', required: false, enum: ['NEW_SUBSCRIPTION', 'RENEWAL', 'UPGRADE'] })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by order_id, tracking_id, or bank_ref_no' })
  @ApiResponse({ status: 200, description: 'Subscription payments fetched successfully' })
  findAllPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('payment_type') payment_type?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAllPayments({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      status: status || undefined,
      payment_type: payment_type || undefined,
      search: search || undefined,
    });
  }

  @Get('payments/:id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTIONS.VIEW))
  @ApiOperation({ summary: 'Get a single payment by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Payment record fetched successfully' })
  @ApiResponse({ status: 404, description: 'Payment record not found' })
  findOnePayment(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOnePayment(id);
  }

  @Patch('payments/:id/status')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTIONS.UPDATE))
  @ApiOperation({ summary: 'Update subscription payment status (super admin)' })
  @ApiParam({ name: 'id', type: Number, description: 'Payment record s_no' })
  @ApiResponse({ status: 200, description: 'Payment status updated successfully' })
  @ApiResponse({ status: 404, description: 'Payment record not found' })
  updatePaymentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.service.updatePaymentStatus(id, dto);
  }

  // ─── User subscription endpoints ───

  @Get('user-subscriptions')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTIONS.VIEW))
  @ApiOperation({ summary: 'List all user subscriptions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING'] })
  @ApiResponse({ status: 200, description: 'User subscriptions fetched successfully' })
  findAllUserSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAllUserSubscriptions({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      status: status || undefined,
    });
  }

  @Get('user-subscriptions/:id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTIONS.VIEW))
  @ApiOperation({ summary: 'Get a single user subscription by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'User subscription fetched successfully' })
  @ApiResponse({ status: 404, description: 'User subscription not found' })
  findOneUserSubscription(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneUserSubscription(id);
  }

  @Patch('user-subscriptions/:id/status')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.SUBSCRIPTIONS.UPDATE))
  @ApiOperation({ summary: 'Update user subscription status (super admin)' })
  @ApiParam({ name: 'id', type: Number, description: 'User subscription s_no' })
  @ApiResponse({ status: 200, description: 'User subscription status updated successfully' })
  @ApiResponse({ status: 404, description: 'User subscription not found' })
  updateUserSubscriptionStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserSubscriptionStatusDto,
  ) {
    return this.service.updateUserSubscriptionStatus(id, dto);
  }
}
