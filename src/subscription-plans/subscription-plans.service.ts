import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async create(dto: CreateSubscriptionPlanDto) {
    const data = {
      name: dto.name,
      description: dto.description,
      duration: dto.duration,
      price: dto.price as any,
      currency: dto.currency,
      features: dto.features as any,
      max_pg_locations: dto.max_pg_locations,
      max_tenants: dto.max_tenants,
      max_rooms: dto.max_rooms,
      max_beds: dto.max_beds,
      max_employees: dto.max_employees,
      max_users: dto.max_users,
      max_invoices_per_month: dto.max_invoices_per_month,
      max_sms_per_month: dto.max_sms_per_month,
      is_free: dto.is_free ?? false,
      is_trial: dto.is_trial ?? false,
      is_active: dto.is_active ?? true,
    };

    const plan = await this.consumerPrisma.subscription_plans.create({
      data: {
        ...(data as unknown as Parameters<
          ConsumerPrismaService['subscription_plans']['create']
        >[0]['data']),
      },
    });

    return ResponseUtil.created(plan, 'Subscription plan created successfully');
  }

  async findAll(params: { page: number; limit: number; is_active?: boolean }) {
    const { page, limit, is_active } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (typeof is_active === 'boolean') {
      where.is_active = is_active;
    }

    const [items, total] = await Promise.all([
      this.consumerPrisma.subscription_plans.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.consumerPrisma.subscription_plans.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit, 'Subscription plans fetched successfully');
  }

  async findOne(id: number) {
    const plan = await this.consumerPrisma.subscription_plans.findUnique({
      where: { s_no: id },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    return ResponseUtil.success(plan, 'Subscription plan fetched successfully');
  }

  async update(id: number, dto: UpdateSubscriptionPlanDto) {
    const existing = await this.consumerPrisma.subscription_plans.findUnique({
      where: { s_no: id },
      select: { s_no: true },
    });

    if (!existing) {
      throw new NotFoundException('Subscription plan not found');
    }

    const data = {
      name: dto.name,
      description: dto.description,
      duration: dto.duration,
      price: dto.price as any,
      currency: dto.currency,
      features: dto.features as any,
      max_pg_locations: dto.max_pg_locations,
      max_tenants: dto.max_tenants,
      max_rooms: dto.max_rooms,
      max_beds: dto.max_beds,
      max_employees: dto.max_employees,
      max_users: dto.max_users,
      max_invoices_per_month: dto.max_invoices_per_month,
      max_sms_per_month: dto.max_sms_per_month,
      is_free: dto.is_free,
      is_trial: dto.is_trial,
      is_active: dto.is_active,
      updated_at: new Date(),
    };

    const updated = await this.consumerPrisma.subscription_plans.update({
      where: { s_no: id },
      data: {
        ...(data as unknown as Parameters<
          ConsumerPrismaService['subscription_plans']['update']
        >[0]['data']),
      },
    });

    return ResponseUtil.success(updated, 'Subscription plan updated successfully');
  }

  async deactivate(id: number) {
    const existing = await this.consumerPrisma.subscription_plans.findUnique({
      where: { s_no: id },
      select: { s_no: true },
    });

    if (!existing) {
      throw new NotFoundException('Subscription plan not found');
    }

    const updated = await this.consumerPrisma.subscription_plans.update({
      where: { s_no: id },
      data: {
        is_active: false,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.success(updated, 'Subscription plan deactivated successfully');
  }
}
