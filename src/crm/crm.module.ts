import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { GoogleLeadsService } from './google-leads.service';
import { ContactsController } from './controllers/contacts.controller';
import { LeadsController } from './controllers/leads.controller';
import { ActivitiesController } from './controllers/activities.controller';
import { SiteVisitsController } from './controllers/site-visits.controller';
import { SubscribersController } from './controllers/subscribers.controller';
import { LeadStagesController } from './controllers/lead-stages.controller';
import { GoogleLeadsController } from './controllers/google-leads.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    ContactsController,
    LeadsController,
    ActivitiesController,
    SiteVisitsController,
    SubscribersController,
    LeadStagesController,
    GoogleLeadsController,
  ],
  providers: [CrmService, GoogleLeadsService],
  exports: [CrmService, GoogleLeadsService],
})
export class CrmModule {}
