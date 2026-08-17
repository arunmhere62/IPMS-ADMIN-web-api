import { Module } from '@nestjs/common';
import { SalesOrganizationsController } from './sales-organizations.controller';
import { SalesOrganizationsService } from './sales-organizations.service';

@Module({
  controllers: [SalesOrganizationsController],
  providers: [SalesOrganizationsService],
  exports: [SalesOrganizationsService],
})
export class SalesOrganizationsModule {}
