export interface MessagePayload {
  phone: string;
  toEmail?: string;
  subject?: string;
  body: string;
  entityType: string;
  entityId: number;
  senderUserId: number;
  sendMode?: 'MANUAL' | 'API';
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
