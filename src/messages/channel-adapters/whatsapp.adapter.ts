import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, MessagePayload, SendResult } from './channel-adapter.interface';

@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);

  async send(payload: MessagePayload): Promise<SendResult> {
    const provider = this.detectProvider();

    if (provider === 'SMARTGROWTH') {
      return this.sendViaSmartGrowth(payload);
    }

    if (provider === 'META') {
      return this.sendViaMeta(payload);
    }

    return this.sendManual(payload);
  }

  private detectProvider(): 'SMARTGROWTH' | 'META' | 'MANUAL' {
    const hasSmartGrowth = Boolean(
      process.env.SMARTGROWTH_API_BASE_URL &&
        process.env.SMARTGROWTH_API_TOKEN &&
        process.env.SMARTGROWTH_API_CODE,
    );
    if (hasSmartGrowth) return 'SMARTGROWTH';

    const hasMeta = Boolean(
      process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN,
    );
    if (hasMeta) return 'META';

    return 'MANUAL';
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
      const baseUrl = process.env.META_API_BASE_URL || 'https://graph.facebook.com/v18.0';
      const url = `${baseUrl}/${phoneNumberId}/messages`;

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

  private async sendViaSmartGrowth(payload: MessagePayload): Promise<SendResult> {
    try {
      const baseUrl = process.env.SMARTGROWTH_API_BASE_URL!;
      const token = process.env.SMARTGROWTH_API_TOKEN!;
      const apiCode = process.env.SMARTGROWTH_API_CODE || '';

      const isTemplateSend =
        Boolean(payload.metaTemplateId) || Boolean(payload.metaTemplateName) || Boolean(payload.templateId);

      if (isTemplateSend) {
        if (process.env.SMARTGROWTH_CREATE_CAMPAIGN_ENDPOINT) {
          return this.sendSmartGrowthCreateCampaign(payload, baseUrl, token);
        }
        return this.sendSmartGrowthLegacyCampaign(payload, baseUrl, token, apiCode);
      }

      return this.sendSmartGrowthSession(payload, baseUrl, token);
    } catch (error: any) {
      this.logger.error(`SmartGrowth WhatsApp send failed: ${error?.message}`);
      return {
        success: false,
        provider: 'SMARTGROWTH',
        status: 'FAILED',
        errorMessage: error?.message,
      };
    }
  }

  private async sendSmartGrowthCreateCampaign(
    payload: MessagePayload,
    baseUrl: string,
    token: string,
  ): Promise<SendResult> {
    const endpoint = process.env.SMARTGROWTH_CREATE_CAMPAIGN_ENDPOINT || '/campaign/create-campaign';
    const url = `${baseUrl}${endpoint}`;
    const templateId =
      payload.metaTemplateId ||
      process.env.SMARTGROWTH_DEFAULT_TEMPLATE_ID ||
      payload.metaTemplateName ||
      '';
    const campaignName =
      payload.campaignName || process.env.SMARTGROWTH_DEFAULT_CAMPAIGN_NAME || 'Admin Panel Campaign';
    const uniqueCampaignName = `${campaignName} ${Date.now()}`;

    if (!templateId) {
      throw new Error('SmartGrowth template id is required for campaign sends');
    }

    const bodyParams = this.buildSmartGrowthBodyParams(payload);
    const mediaUrl = payload.mediaUrl || process.env.SMARTGROWTH_DEFAULT_MEDIA_URL;
    const mediaId = payload.mediaId || process.env.SMARTGROWTH_DEFAULT_MEDIA_ID;
    const filename = payload.filename || process.env.SMARTGROWTH_DEFAULT_MEDIA_FILENAME || 'PG Video Campaign.mp4';

    const contacts =
      payload.contacts && payload.contacts.length > 0
        ? payload.contacts
        : [{ Numbers: this.normalizePhone(payload.phone) }];

    const requestBody: Record<string, any> = {
      campaignName: uniqueCampaignName,
      templateId,
      header: {},
      contacts,
      bodyParams,
    };

    if (mediaUrl || mediaId) {
      requestBody.header = {
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaId ? { id: mediaId } : {}),
        ...(filename ? { filename } : {}),
      };
    }

    this.logger.debug(`SmartGrowth create-campaign request: ${url}`);
    this.logger.debug(`SmartGrowth create-campaign body: ${JSON.stringify(requestBody)}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    this.logger.debug(`SmartGrowth create-campaign response [HTTP ${response.status}]: ${rawText}`);

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { rawText };
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.error?.message || `HTTP ${response.status}: ${rawText}`);
    }

    return {
      success: true,
      provider: 'SMARTGROWTH',
      providerMsgId: data?._id || data?.id || data?.campaignId || data?.wabaId || data?.messageId || JSON.stringify(data),
      status: 'SENT',
    };
  }

  private async sendSmartGrowthLegacyCampaign(
    payload: MessagePayload,
    baseUrl: string,
    token: string,
    apiCode: string,
  ): Promise<SendResult> {
    const endpoint = process.env.SMARTGROWTH_CAMPAIGN_ENDPOINT || '/send/campaign';
    const url = `${baseUrl}${endpoint}`;
    const templateId =
      payload.metaTemplateId ||
      process.env.SMARTGROWTH_DEFAULT_TEMPLATE_ID ||
      payload.metaTemplateName ||
      '';
    const campaignName =
      payload.campaignName || process.env.SMARTGROWTH_DEFAULT_CAMPAIGN_NAME || 'Admin Panel Campaign';
    const uniqueCampaignName = `${campaignName} ${Date.now()}`;
    const language = payload.language || process.env.SMARTGROWTH_DEFAULT_TEMPLATE_LANGUAGE || 'en_US';

    if (!templateId) {
      throw new Error('SmartGrowth template id is required for campaign sends');
    }

    const bodyParams = this.buildSmartGrowthBodyParams(payload);
    const mediaUrl = payload.mediaUrl || process.env.SMARTGROWTH_DEFAULT_MEDIA_URL;
    const mediaId = payload.mediaId || process.env.SMARTGROWTH_DEFAULT_MEDIA_ID;

    const requestBody: Record<string, any> = {
      templateId,
      apiCode,
      campaignName: uniqueCampaignName,
      phoneNumbers: [this.normalizePhone(payload.phone)],
      language,
      bodyParams,
    };

    if (mediaId) {
      requestBody.mediaId = mediaId;
    }
    if (mediaUrl && !mediaId) {
      requestBody.mediaUrl = mediaUrl;
    }

    this.logger.debug(`SmartGrowth legacy campaign request: ${url}`);
    this.logger.debug(`SmartGrowth legacy campaign body: ${JSON.stringify(requestBody)}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    this.logger.debug(`SmartGrowth legacy campaign response [HTTP ${response.status}]: ${rawText}`);

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { rawText };
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.error?.message || `HTTP ${response.status}: ${rawText}`);
    }

    return {
      success: true,
      provider: 'SMARTGROWTH',
      providerMsgId: data?.wabaId || data?.messageId || data?.data?.messageId || data?.data?.id || data?.id || JSON.stringify(data),
      status: 'SENT',
    };
  }

  private async sendSmartGrowthSession(
    payload: MessagePayload,
    baseUrl: string,
    token: string,
  ): Promise<SendResult> {
    const endpoint = process.env.SMARTGROWTH_SESSION_ENDPOINT || '/send/session';
    const url = `${baseUrl}${endpoint}`;

    const requestBody = {
      to: this.normalizePhone(payload.phone),
      message: {
        type: 'text',
        text: payload.body,
        previewUrl: false,
      },
      clientReference: `admin-${payload.entityType}-${payload.entityId}`,
    };

    this.logger.debug(`SmartGrowth session request: ${url}`);
    this.logger.debug(`SmartGrowth session body: ${JSON.stringify(requestBody)}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    this.logger.debug(`SmartGrowth session response [HTTP ${response.status}]: ${rawText}`);

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { rawText };
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.error?.message || `HTTP ${response.status}: ${rawText}`);
    }

    return {
      success: true,
      provider: 'SMARTGROWTH',
      providerMsgId: data?.wabaId || data?.messageId || data?.data?.messageId || data?.data?.id || data?.id || JSON.stringify(data),
      status: 'SENT',
    };
  }

  private buildSmartGrowthBodyParams(payload: MessagePayload): string[] {
    const variables = payload.variables || {};

    if (payload.metaTemplateId === process.env.SMARTGROWTH_DEFAULT_TEMPLATE_ID) {
      return [
        variables.recipient_name || variables.name || variables.tenant_name || '',
        variables.pg_name || variables.organization_name || variables.company || '',
      ];
    }

    const body = payload.body;
    const placeholderNames = this.extractNamedPlaceholders(body);
    return placeholderNames.map((key) => variables[key] ?? '');
  }

  private extractNamedPlaceholders(template: string): string[] {
    const matches = template.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
    const keys: string[] = [];
    for (const match of matches) {
      keys.push(match[1]);
    }
    return keys;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
