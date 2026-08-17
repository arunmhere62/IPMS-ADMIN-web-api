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
import { MessagesModule } from './messages/messages.module';
import { MessageTemplatesModule } from './message-templates/message-templates.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { DirectoryListingsModule } from './directory-listings/directory-listings.module';
import { RbacModule } from './common/rbac/rbac.module';
import { UsersModule } from './users/users.module';
import { SalesOrganizationsModule } from './sales-organizations/sales-organizations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    S3Module,
    RbacModule,
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
    MessagesModule,
    MessageTemplatesModule,
    AppSettingsModule,
    DirectoryListingsModule,
    UsersModule,
    SalesOrganizationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
