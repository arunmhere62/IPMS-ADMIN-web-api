import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async create(dto: CreateCouponDto, userId: number) {
    const code = dto.code.trim().toUpperCase();

    // Check for duplicate
    const existing = await this.consumerPrisma.coupons.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Coupon code "${code}" already exists`);
    }

    if (dto.discount_value <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }

    if (dto.discount_type === 'PERCENTAGE' && dto.discount_value > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    const coupon = await this.consumerPrisma.coupons.create({
      data: {
        code,
        description: dto.description || null,
        discount_type: dto.discount_type,
        discount_value: dto.discount_value as any,
        max_discount_amount: (dto.max_discount_amount ?? null) as any,
        min_order_amount: (dto.min_order_amount ?? 0) as any,
        max_uses: dto.max_uses ?? null,
        max_uses_per_user: dto.max_uses_per_user ?? 1,
        applicable_plan_ids: (dto.applicable_plan_ids ?? null) as any,
        valid_from: dto.valid_from ? new Date(dto.valid_from) : new Date(),
        valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
        is_active: dto.is_active ?? true,
        created_by: userId,
        updated_by: userId,
      },
    });

    return ResponseUtil.created(coupon, 'Coupon created successfully');
  }

  async findAll(params: { is_active?: boolean; search?: string }) {
    const where: any = {};
    if (typeof params.is_active === 'boolean') {
      where.is_active = params.is_active;
    }
    if (params.search) {
      where.code = { contains: params.search };
    }

    const coupons = await this.consumerPrisma.coupons.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { coupon_redemptions: true },
        },
      },
    });

    return ResponseUtil.success(coupons, 'Coupons fetched successfully');
  }

  async findOne(id: number) {
    const coupon = await this.consumerPrisma.coupons.findUnique({
      where: { s_no: id },
      include: {
        coupon_redemptions: {
          orderBy: { redeemed_at: 'desc' },
          take: 50,
        },
        _count: {
          select: { coupon_redemptions: true },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return ResponseUtil.success(coupon, 'Coupon fetched successfully');
  }

  async update(id: number, dto: UpdateCouponDto, userId: number) {
    const existing = await this.consumerPrisma.coupons.findUnique({ where: { s_no: id } });
    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    const updateData: any = { updated_by: userId };

    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.discount_type !== undefined) updateData.discount_type = dto.discount_type;
    if (dto.discount_value !== undefined) {
      if (dto.discount_value <= 0) throw new BadRequestException('Discount value must be greater than 0');
      updateData.discount_value = dto.discount_value as any;
    }
    if (dto.max_discount_amount !== undefined) updateData.max_discount_amount = (dto.max_discount_amount ?? null) as any;
    if (dto.min_order_amount !== undefined) updateData.min_order_amount = (dto.min_order_amount ?? 0) as any;
    if (dto.max_uses !== undefined) updateData.max_uses = dto.max_uses;
    if (dto.max_uses_per_user !== undefined) updateData.max_uses_per_user = dto.max_uses_per_user;
    if (dto.applicable_plan_ids !== undefined) updateData.applicable_plan_ids = (dto.applicable_plan_ids ?? null) as any;
    if (dto.valid_from !== undefined) updateData.valid_from = dto.valid_from ? new Date(dto.valid_from) : new Date();
    if (dto.valid_until !== undefined) updateData.valid_until = dto.valid_until ? new Date(dto.valid_until) : null;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    const coupon = await this.consumerPrisma.coupons.update({
      where: { s_no: id },
      data: updateData,
    });

    return ResponseUtil.success(coupon, 'Coupon updated successfully');
  }

  async deactivate(id: number) {
    const existing = await this.consumerPrisma.coupons.findUnique({ where: { s_no: id } });
    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    const coupon = await this.consumerPrisma.coupons.update({
      where: { s_no: id },
      data: { is_active: false },
    });

    return ResponseUtil.success(coupon, 'Coupon deactivated successfully');
  }

  async getRedemptions(couponId: number, page = 1, limit = 20) {
    const coupon = await this.consumerPrisma.coupons.findUnique({ where: { s_no: couponId } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const skip = (page - 1) * limit;

    const [redemptions, total] = await Promise.all([
      this.consumerPrisma.coupon_redemptions.findMany({
        where: { coupon_id: couponId },
        orderBy: { redeemed_at: 'desc' },
        skip,
        take: limit,
      }),
      this.consumerPrisma.coupon_redemptions.count({
        where: { coupon_id: couponId },
      }),
    ]);

    return ResponseUtil.success(
      { redemptions, total, page, limit, totalPages: Math.ceil(total / limit) },
      'Redemptions fetched successfully',
    );
  }
}
