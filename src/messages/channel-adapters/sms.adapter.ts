import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, MessagePayload, SendResult } from './channel-adapter.interface';

@Injectable()
export class SmsAdapter implements ChannelAdapter {
  private readonly logger = new Logger(SmsAdapter.name);

  async send(payload: MessagePayload): Promise<SendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      this.logger.warn('Twilio credentials not configured; SMS logged only');
      return {
        success: true,
        provider: 'LOGGED',
        status: 'PENDING',
      };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: from,
          To: payload.phone,
          Body: payload.body,
        }).toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || `HTTP ${response.status}`);
      }

      return {
        success: true,
        provider: 'TWILIO',
        providerMsgId: data?.sid,
        status: 'SENT',
      };
    } catch (error: any) {
      this.logger.error(`SMS send failed: ${error?.message}`);
      return {
        success: false,
        provider: 'TWILIO',
        status: 'FAILED',
        errorMessage: error?.message,
      };
    }
  }
}
