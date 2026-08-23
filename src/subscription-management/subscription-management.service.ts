import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { UpdatePaymentStatusDto, SubscriptionPaymentStatus } from './dto/update-payment-status.dto';
import {
  UpdateUserSubscriptionStatusDto,
  UserSubscriptionStatus,
} from './dto/update-user-subscription-status.dto';

@Injectable()
export class SubscriptionManagementService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  /**
   * List all subscription payments with filters and pagination.
   * Includes related plan, user subscription, user, and organization info.
   * Since subscription_payments has no FK relation to users/organization,
   * we batch-fetch them separately and merge.
   */
  async findAllPayments(params: {
    page: number;
    limit: number;
    status?: string;
    payment_type?: string;
    search?: string;
  }) {
    const { page, limit, status, payment_type, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (payment_type) {
      where.payment_type = payment_type;
    }
    if (search) {
      // Search across payment fields AND user/org name (no FK relation, so
      // we resolve matching user/org IDs first, then include them in the OR).
      const [matchingUsers, matchingOrgs] = await Promise.all([
        this.consumerPrisma.users.findMany({
          where: {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } },
            ],
          },
          select: { s_no: true },
        }),
        this.consumerPrisma.organization.findMany({
          where: { name: { contains: search } },
          select: { s_no: true },
        }),
      ]);

      const matchingUserIds = matchingUsers.map((u) => u.s_no);
      const matchingOrgIds = matchingOrgs.map((o) => o.s_no);

      const orClauses: any[] = [
        { order_id: { contains: search } },
        { tracking_id: { contains: search } },
        { bank_ref_no: { contains: search } },
      ];
      if (matchingUserIds.length > 0) {
        orClauses.push({ user_id: { in: matchingUserIds } });
      }
      if (matchingOrgIds.length > 0) {
        orClauses.push({ organization_id: { in: matchingOrgIds } });
      }

      where.OR = orClauses;
    }

    const [items, total] = await Promise.all([
      this.consumerPrisma.subscription_payments.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          subscription_plans: {
            select: { s_no: true, name: true, duration: true, price: true, currency: true, is_free: true, is_trial: true },
          },
          user_subscriptions: {
            select: { s_no: true, status: true, start_date: true, end_date: true, auto_renew: true, is_trial: true },
          },
        },
      }),
      this.consumerPrisma.subscription_payments.count({ where }),
    ]);

    // Batch-fetch user and organization details (no FK relation in schema)
    const userIds = [...new Set(items.map((p) => p.user_id).filter(Boolean))];
    const orgIds = [...new Set(items.map((p) => p.organization_id).filter(Boolean))];

    const [users, orgs] = await Promise.all([
      userIds.length > 0
        ? this.consumerPrisma.users.findMany({
            where: { s_no: { in: userIds } },
            select: { s_no: true, name: true, email: true, phone: true },
          })
        : [],
      orgIds.length > 0
        ? this.consumerPrisma.organization.findMany({
            where: { s_no: { in: orgIds } },
            select: { s_no: true, name: true, status: true },
          })
        : [],
    ]);

    const userMap = new Map<number, typeof users[number]>(users.map((u) => [u.s_no, u] as const));
    const orgMap = new Map<number, typeof orgs[number]>(orgs.map((o) => [o.s_no, o] as const));

    const enrichedItems = items.map((p) => ({
      ...p,
      user: userMap.get(p.user_id) ?? null,
      organization: orgMap.get(p.organization_id) ?? null,
    }));

    return ResponseUtil.paginated(enrichedItems, total, page, limit, 'Subscription payments fetched successfully');
  }

  /**
   * Get a single payment by ID with full details.
   */
  async findOnePayment(id: number) {
    const payment = await this.consumerPrisma.subscription_payments.findUnique({
      where: { s_no: id },
      include: {
        subscription_plans: true,
        user_subscriptions: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // Enrich with user and organization details
    const [user, organization] = await Promise.all([
      payment.user_id
        ? this.consumerPrisma.users.findUnique({
            where: { s_no: payment.user_id },
            select: { s_no: true, name: true, email: true, phone: true },
          })
        : null,
      payment.organization_id
        ? this.consumerPrisma.organization.findUnique({
            where: { s_no: payment.organization_id },
            select: { s_no: true, name: true, status: true },
          })
        : null,
    ]);

    return ResponseUtil.success(
      { ...payment, user, organization },
      'Payment record fetched successfully',
    );
  }

  /**
   * Update the status of a subscription payment.
   * Super admin can manually mark a payment as SUCCESS, FAILURE, etc.
   */
  async updatePaymentStatus(id: number, dto: UpdatePaymentStatusDto) {
    const payment = await this.consumerPrisma.subscription_payments.findUnique({
      where: { s_no: id },
      include: { user_subscriptions: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const newStatus = dto.status as SubscriptionPaymentStatus;
    const updateData: any = {
      status: newStatus,
    };

    // If admin is marking payment as SUCCESS, also activate the subscription
    if (newStatus === SubscriptionPaymentStatus.SUCCESS && payment.subscription_id) {
      const plan = await this.consumerPrisma.subscription_plans.findUnique({
        where: { s_no: payment.plan_id },
      });

      const startDate = new Date();
      const endDate = new Date(Date.now() + (plan?.duration ?? 0) * 24 * 60 * 60 * 1000);

      await this.consumerPrisma.$transaction(async (tx) => {
        // Update payment status
        await tx.subscription_payments.update({
          where: { s_no: id },
          data: updateData,
        });

        // Activate the subscription
        await tx.user_subscriptions.update({
          where: { s_no: payment.subscription_id },
          data: {
            status: 'ACTIVE' as any,
            start_date: startDate,
            end_date: endDate,
          },
        });
      });

      const updated = await this.consumerPrisma.subscription_payments.findUnique({
        where: { s_no: id },
        include: { user_subscriptions: true },
      });

      return ResponseUtil.success(
        { payment: updated, note: dto.note },
        'Payment marked as SUCCESS and subscription activated',
      );
    }

    // If admin is marking payment as FAILURE/ABORTED, cancel pending subscription
    if (
      (newStatus === SubscriptionPaymentStatus.FAILURE || newStatus === SubscriptionPaymentStatus.ABORTED) &&
      payment.subscription_id
    ) {
      await this.consumerPrisma.$transaction(async (tx) => {
        await tx.subscription_payments.update({
          where: { s_no: id },
          data: updateData,
        });

        await tx.user_subscriptions.updateMany({
          where: { s_no: payment.subscription_id, status: 'PENDING' as any },
          data: { status: 'CANCELLED' as any },
        });
      });

      const updated = await this.consumerPrisma.subscription_payments.findUnique({
        where: { s_no: id },
        include: { user_subscriptions: true },
      });

      return ResponseUtil.success(
        { payment: updated, note: dto.note },
        `Payment marked as ${newStatus} and pending subscription cancelled`,
      );
    }

    // Simple status update without subscription side-effects
    const updated = await this.consumerPrisma.subscription_payments.update({
      where: { s_no: id },
      data: updateData,
      include: { user_subscriptions: true },
    });

    return ResponseUtil.success(
      { payment: updated, note: dto.note },
      `Payment status updated to ${newStatus}`,
    );
  }

  /**
   * List all user subscriptions with filters and pagination.
   */
  async findAllUserSubscriptions(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
  }) {
    const { page, limit, status, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.consumerPrisma.user_subscriptions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          subscription_plans: {
            select: { s_no: true, name: true, duration: true, price: true, currency: true },
          },
          subscription_payments: {
            select: {
              s_no: true,
              order_id: true,
              status: true,
              amount: true,
              currency: true,
              payment_type: true,
              created_at: true,
            },
            orderBy: { created_at: 'desc' },
          },
        },
      }),
      this.consumerPrisma.user_subscriptions.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit, 'User subscriptions fetched successfully');
  }

  /**
   * Get a single user subscription by ID with full details.
   */
  async findOneUserSubscription(id: number) {
    const subscription = await this.consumerPrisma.user_subscriptions.findUnique({
      where: { s_no: id },
      include: {
        subscription_plans: true,
        subscription_payments: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('User subscription not found');
    }

    return ResponseUtil.success(subscription, 'User subscription fetched successfully');
  }

  /**
   * Update the status of a user subscription.
   * Super admin can manually activate, cancel, or expire a subscription.
   */
  async updateUserSubscriptionStatus(id: number, dto: UpdateUserSubscriptionStatusDto) {
    const subscription = await this.consumerPrisma.user_subscriptions.findUnique({
      where: { s_no: id },
    });

    if (!subscription) {
      throw new NotFoundException('User subscription not found');
    }

    const newStatus = dto.status as UserSubscriptionStatus;
    const updateData: any = { status: newStatus as any };

    // If activating, set proper start/end dates
    if (newStatus === UserSubscriptionStatus.ACTIVE) {
      const plan = await this.consumerPrisma.subscription_plans.findUnique({
        where: { s_no: subscription.plan_id },
      });

      updateData.start_date = new Date();
      updateData.end_date = new Date(Date.now() + (plan?.duration ?? 0) * 24 * 60 * 60 * 1000);
    }

    // If cancelling or expiring, set end_date to now
    if (newStatus === UserSubscriptionStatus.CANCELLED || newStatus === UserSubscriptionStatus.EXPIRED) {
      updateData.end_date = new Date();
    }

    const updated = await this.consumerPrisma.user_subscriptions.update({
      where: { s_no: id },
      data: updateData,
      include: {
        subscription_plans: { select: { name: true, duration: true } },
      },
    });

    return ResponseUtil.success(
      { subscription: updated, note: dto.note },
      `User subscription status updated to ${newStatus}`,
    );
  }
}
