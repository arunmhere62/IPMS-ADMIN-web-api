import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { VariableResolverService } from './variable-resolver.service';
import { WhatsAppAdapter } from './channel-adapters/whatsapp.adapter';
import { SmsAdapter } from './channel-adapters/sms.adapter';
import { EmailAdapter } from './channel-adapters/email.adapter';

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService,
    VariableResolverService,
    WhatsAppAdapter,
    SmsAdapter,
    EmailAdapter,
  ],
})
export class MessagesModule {}
