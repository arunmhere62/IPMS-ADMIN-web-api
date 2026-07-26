import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { ContactsController } from './controllers/contacts.controller';
import { LeadsController } from './controllers/leads.controller';
import { ActivitiesController } from './controllers/activities.controller';
import { SiteVisitsController } from './controllers/site-visits.controller';
import { SubscribersController } from './controllers/subscribers.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    ContactsController,
    LeadsController,
    ActivitiesController,
    SiteVisitsController,
    SubscribersController,
  ],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
