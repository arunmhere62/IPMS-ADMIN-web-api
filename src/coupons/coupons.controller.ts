import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@ApiTags('coupons')
@Controller('coupon')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class CouponsController {
  constructor(private readonly service: CouponsService) {}

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.COUPONS.CREATE))
  @ApiOperation({ summary: 'Create coupon' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  create(@Body() dto: CreateCouponDto, @Headers('x-user-id') userId: string) {
    return this.service.create(dto, parseInt(userId, 10));
  }

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.COUPONS.VIEW))
  @ApiOperation({ summary: 'List coupons' })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Coupons fetched successfully' })
  findAll(
    @Query('is_active') is_active?: string,
    @Query('search') search?: string,
  ) {
    const isActiveValue =
      typeof is_active === 'string'
        ? is_active === 'true'
          ? true
          : is_active === 'false'
            ? false
            : undefined
        : undefined;

    return this.service.findAll({
      is_active: isActiveValue,
      search: search || undefined,
    });
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.COUPONS.VIEW))
  @ApiOperation({ summary: 'Get coupon by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Coupon fetched successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.COUPONS.UPDATE))
  @ApiOperation({ summary: 'Update coupon' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCouponDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.service.update(id, dto, parseInt(userId, 10));
  }

  @Post(':id/deactivate')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.COUPONS.DELETE))
  @ApiOperation({ summary: 'Deactivate coupon (sets is_active=false)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Coupon deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.service.deactivate(id);
  }

  @Get(':id/redemptions')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.COUPONS.VIEW))
  @ApiOperation({ summary: 'Get coupon redemption history' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Redemptions fetched successfully' })
  getRedemptions(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getRedemptions(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
