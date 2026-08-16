import { Module } from '@nestjs/common';
import { DirectoryListingsController } from './directory-listings.controller';
import { DirectoryListingsService } from './directory-listings.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DirectoryListingsController],
  providers: [DirectoryListingsService],
  exports: [DirectoryListingsService],
})
export class DirectoryListingsModule {}
