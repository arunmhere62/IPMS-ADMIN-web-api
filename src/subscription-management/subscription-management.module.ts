import { Module } from '@nestjs/common';
import { SubscriptionManagementController } from './subscription-management.controller';
import { SubscriptionManagementService } from './subscription-management.service';

@Module({
  controllers: [SubscriptionManagementController],
  providers: [SubscriptionManagementService],
  exports: [SubscriptionManagementService],
})
export class SubscriptionManagementModule {}
