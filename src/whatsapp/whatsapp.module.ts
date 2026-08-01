import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ManualWhatsAppProvider } from './providers/manual-whatsapp.provider';
import { MetaCloudApiProvider } from './providers/meta-cloud-api.provider';

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, ManualWhatsAppProvider, MetaCloudApiProvider],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
