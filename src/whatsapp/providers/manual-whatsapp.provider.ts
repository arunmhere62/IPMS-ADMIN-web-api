import { Injectable } from '@nestjs/common';
import { WhatsAppProvider, SendMessageParams, SendMessageResult } from './whatsapp-provider.interface';

@Injectable()
export class ManualWhatsAppProvider implements WhatsAppProvider {
  sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const phone = params.phone.replace(/[^0-9]/g, '');
    const encodedMessage = encodeURIComponent(params.message);
    const waLink = `https://wa.me/${phone}?text=${encodedMessage}`;

    return Promise.resolve({
      success: true,
      waLink,
    });
  }

  getProviderName(): string {
    return 'manual';
  }
}
