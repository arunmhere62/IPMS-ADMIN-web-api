import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { S3Module } from './s3/s3.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { RolePermissionsModule } from './role-permissions/role-permissions.module';
import { AuthModule } from './auth/auth.module';
import { LegalDocumentsModule } from './legal-documents/legal-documents.module';
import { TicketsModule } from './tickets/tickets.module';
import { ConfigModule } from '@nestjs/config';
import { CrmModule } from './crm/crm.module';
import { LocationModule } from './location/location.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    S3Module,
    AuthModule,
    LegalDocumentsModule,
    TicketsModule,
    OrganizationsModule,
    SubscriptionPlansModule,
    PermissionsModule,
    RolesModule,
    RolePermissionsModule,
    CrmModule,
    LocationModule,
    WhatsAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
