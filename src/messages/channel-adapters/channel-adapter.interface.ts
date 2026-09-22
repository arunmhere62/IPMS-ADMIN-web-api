export interface MessagePayload {
  phone: string;
  toEmail?: string;
  subject?: string;
  body: string;
  entityType: string;
  entityId: number;
  senderUserId: number;
  sendMode?: 'MANUAL' | 'API';
  templateId?: number;
  metaTemplateName?: string;
  metaTemplateId?: string;
  language?: string;
  campaignName?: string;
  mediaUrl?: string;
  mediaId?: string;
  filename?: string;
  variables?: Record<string, string>;
  contacts?: { Numbers: string }[];
}

export interface SendResult {
  success: boolean;
  provider: string;
  providerMsgId?: string;
  status: string;
  link?: string;
  errorMessage?: string;
}

export interface ChannelAdapter {
  send(payload: MessagePayload): Promise<SendResult>;
}
