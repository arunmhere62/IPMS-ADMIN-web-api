import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, MessagePayload, SendResult } from './channel-adapter.interface';

@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);

  async send(payload: MessagePayload): Promise<SendResult> {
    const useMetaApi =
      payload.sendMode === 'API' ||
      (payload.sendMode === undefined &&
        Boolean(process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN));

    if (!useMetaApi) {
      return this.sendManual(payload);
    }

    return this.sendViaMeta(payload);
  }

  private sendManual(payload: MessagePayload): SendResult {
    const phone = this.normalizePhone(payload.phone);
    const encodedBody = encodeURIComponent(payload.body);
    const link = `https://wa.me/${phone}?text=${encodedBody}`;

    return {
      success: true,
      provider: 'MANUAL',
      status: 'LINK_GENERATED',
      link,
    };
  }

  private async sendViaMeta(payload: MessagePayload): Promise<SendResult> {
    try {
      const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
      const accessToken = process.env.META_ACCESS_TOKEN;
      const url = `${process.env.META_API_BASE_URL}/${phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: this.normalizePhone(payload.phone),
          type: 'text',
          text: { body: payload.body },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }

      return {
        success: true,
        provider: 'META',
        providerMsgId: data?.messages?.[0]?.id,
        status: 'SENT',
      };
    } catch (error: any) {
      this.logger.error(`WhatsApp API send failed: ${error?.message}`);
      return {
        success: false,
        provider: 'META',
        status: 'FAILED',
        errorMessage: error?.message,
      };
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
