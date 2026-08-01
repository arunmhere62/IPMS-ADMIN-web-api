export interface SendMessageParams {
  phone: string;
  message: string;
  templateName?: string;
  templateVariables?: Record<string, string>;
}

export interface SendMessageResult {
  success: boolean;
  providerMessageId?: string;
  waLink?: string;
  error?: string;
}

export interface WhatsAppProvider {
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  getProviderName(): string;
}
