import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppProvider, SendMessageParams, SendMessageResult } from './whatsapp-provider.interface';

@Injectable()
export class MetaCloudApiProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MetaCloudApiProvider.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion = 'v18.0';

  constructor(private readonly configService: ConfigService) {
    this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return {
        success: false,
        error: 'WhatsApp API not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
      };
    }

    const phone = params.phone.replace(/[^0-9]/g, '');

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

      let body: any;

      if (params.templateName) {
        // Template message
        const components: any[] = [];
        if (params.templateVariables) {
          const parameters = Object.values(params.templateVariables).map((value) => ({
            type: 'text',
            text: value,
          }));
          components.push({ type: 'body', parameters });
        }

        body = {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: 'en' },
            components,
          },
        };
      } else {
        // Free-form text message (only works within 24h conversation window)
        body = {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: params.message },
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || JSON.stringify(data);
        this.logger.error(`Meta API error: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      return { success: true, providerMessageId };
    } catch (error: any) {
      this.logger.error(`Meta API request failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getProviderName(): string {
    return 'meta-cloud-api';
  }
}
