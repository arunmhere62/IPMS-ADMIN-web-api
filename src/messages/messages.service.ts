import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { whatsapp_messages_channel, whatsapp_messages_mode, whatsapp_messages_status } from '@prisma/client-consumer';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { SendMessageDto } from './dto/send-message.dto';
import { PreviewMessageDto } from './dto/preview-message.dto';
import { VariableResolverService, MessageContext } from './variable-resolver.service';
import { ChannelAdapter } from './channel-adapters/channel-adapter.interface';
import { WhatsAppAdapter } from './channel-adapters/whatsapp.adapter';
import { SmsAdapter } from './channel-adapters/sms.adapter';
import { EmailAdapter } from './channel-adapters/email.adapter';

@Injectable()
export class MessagesService {
  constructor(
    private readonly consumerPrisma: ConsumerPrismaService,
    private readonly variableResolver: VariableResolverService,
    private readonly whatsAppAdapter: WhatsAppAdapter,
    private readonly smsAdapter: SmsAdapter,
    private readonly emailAdapter: EmailAdapter,
  ) {}

  async preview(dto: PreviewMessageDto, senderUserId: number) {
    const { body, subject } = await this.resolveAndRender(dto, senderUserId);

    return ResponseUtil.success({
      channel: dto.channel,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
      subject,
      body,
    }, 'Preview generated');
  }

  async send(dto: SendMessageDto, senderUserId: number) {
    const { body, subject, variables, recipientPhone, recipientEmail } =
      await this.resolveAndRender(dto, senderUserId, true);

    if (!recipientPhone && dto.channel !== 'EMAIL') {
      throw new BadRequestException('Recipient phone number is required');
    }

    if (!recipientEmail && dto.channel === 'EMAIL') {
      throw new BadRequestException('Recipient email is required for email channel');
    }

    const adapter = this.getAdapter(dto.channel);
    const mode: whatsapp_messages_mode = this.getMode(dto.channel);

    const result = await adapter.send({
      phone: recipientPhone || '',
      toEmail: recipientEmail,
      subject,
      body,
      entityType: dto.entity_type,
      entityId: dto.entity_id,
      senderUserId,
      sendMode: dto.send_mode as 'MANUAL' | 'API' | undefined,
    });

    const status = result.status as whatsapp_messages_status;

    const message = await this.consumerPrisma.whatsapp_messages.create({
      data: {
        phone: recipientPhone || '',
        to_email: recipientEmail,
        subject,
        message: dto.body,
        rendered_message: body,
        variables: variables as any,
        template_id: dto.template_id || null,
        channel: dto.channel,
        provider: result.provider,
        mode,
        status,
        provider_msg_id: result.providerMsgId || null,
        sent_by: senderUserId,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id,
        error_message: result.errorMessage || null,
      } as any,
    });

    return ResponseUtil.success(
      {
        ...message,
        link: result.link || null,
      },
      result.success ? 'Message sent successfully' : 'Message send failed',
    );
  }

  async findAll(params: { page: number; limit: number; entity_type?: string; entity_id?: number }) {
    const { page, limit, entity_type, entity_id } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (entity_type) where.entity_type = entity_type;
    if (entity_id) where.entity_id = entity_id;

    const [items, total] = await Promise.all([
      this.consumerPrisma.whatsapp_messages.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { whatsapp_templates: true, users: { select: { name: true, email: true } } },
      }),
      this.consumerPrisma.whatsapp_messages.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit);
  }

  async findOne(id: number) {
    const message = await this.consumerPrisma.whatsapp_messages.findUnique({
      where: { s_no: id },
      include: { whatsapp_templates: true, users: { select: { name: true, email: true } } },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return ResponseUtil.success(message, 'Message retrieved');
  }

  private async resolveAndRender(
    dto: SendMessageDto | PreviewMessageDto,
    senderUserId: number,
    returnRecipientInfo = false,
  ) {
    let templateBody = dto.body || '';
    let templateSubject: string | undefined = dto.subject;

    if (dto.template_id) {
      const template = await this.consumerPrisma.whatsapp_templates.findUnique({
        where: { s_no: dto.template_id },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      if (template.channel !== dto.channel) {
        throw new BadRequestException(
          `Template channel ${template.channel} does not match selected channel ${dto.channel}`,
        );
      }

      templateBody = template.body;
      templateSubject = templateSubject || template.subject || undefined;
    }

    if (!templateBody.trim()) {
      throw new BadRequestException('Message body is required');
    }

    const validation = this.variableResolver.validatePlaceholders(
      templateBody,
      dto.manual_variables,
    );
    if (!validation.valid) {
      throw new BadRequestException(
        `Unknown placeholder(s): ${validation.unknown.map((k) => `{{${k}}}`).join(', ')}. Use only available variables.`,
      );
    }

    if (templateSubject) {
      const subjectValidation = this.variableResolver.validatePlaceholders(
        templateSubject,
        dto.manual_variables,
      );
      if (!subjectValidation.valid) {
        throw new BadRequestException(
          `Unknown placeholder(s) in subject: ${subjectValidation.unknown.map((k) => `{{${k}}}`).join(', ')}. Use only available variables.`,
        );
      }
    }

    const variables = await this.variableResolver.resolve({
      entityType: dto.entity_type,
      entityId: dto.entity_id,
      senderUserId,
      manualVariables: dto.manual_variables,
    });

    const body = this.variableResolver.renderTemplate(templateBody, variables);
    const subject = templateSubject
      ? this.variableResolver.renderTemplate(templateSubject, variables)
      : undefined;

    if (!returnRecipientInfo) {
      return { body, subject, variables };
    }

    const recipientPhone = this.getRecipientPhone(variables, dto.channel);
    const recipientEmail = variables.recipient_email;

    return { body, subject, variables, recipientPhone, recipientEmail };
  }

  private getRecipientPhone(
    variables: Record<string, string>,
    channel: whatsapp_messages_channel,
  ): string {
    if (channel === 'EMAIL') return '';
    return variables.recipient_phone || variables.recipient_whatsapp || '';
  }

  private getAdapter(channel: whatsapp_messages_channel): ChannelAdapter {
    switch (channel) {
      case 'WHATSAPP':
        return this.whatsAppAdapter;
      case 'SMS':
        return this.smsAdapter;
      case 'EMAIL':
        return this.emailAdapter;
      default:
        throw new BadRequestException(`Unsupported channel: ${channel}`);
    }
  }

  private getMode(channel: whatsapp_messages_channel): whatsapp_messages_mode {
    if (channel === 'WHATSAPP') {
      const useMetaApi = Boolean(
        process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN,
      );
      return useMetaApi ? 'API' : 'MANUAL';
    }
    return 'API';
  }
}
