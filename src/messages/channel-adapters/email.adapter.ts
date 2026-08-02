import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, MessagePayload, SendResult } from './channel-adapter.interface';

@Injectable()
export class EmailAdapter implements ChannelAdapter {
  private readonly logger = new Logger(EmailAdapter.name);

  async send(payload: MessagePayload): Promise<SendResult> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      this.logger.warn('SMTP credentials not configured; email logged only');
      return {
        success: true,
        provider: 'LOGGED',
        status: 'PENDING',
      };
    }

    // NOTE: Add nodemailer integration here once the dependency is installed.
    this.logger.log(`Email would be sent via SMTP to ${payload.toEmail}`);
    return {
      success: true,
      provider: 'SMTP',
      status: 'PENDING',
    };
  }
}
