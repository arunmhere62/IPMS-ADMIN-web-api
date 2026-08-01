import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { ManualWhatsAppProvider } from './providers/manual-whatsapp.provider';
import { MetaCloudApiProvider } from './providers/meta-cloud-api.provider';
import { SendWhatsAppMessageDto } from './dto/send-message.dto';
import { CreateWhatsAppTemplateDto } from './dto/create-template.dto';

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly consumerPrisma: ConsumerPrismaService,
    private readonly manualProvider: ManualWhatsAppProvider,
    private readonly metaProvider: MetaCloudApiProvider,
  ) {}

  async sendMessage(dto: SendWhatsAppMessageDto, userId: number) {
    let messageText = dto.message || '';
    let templateName: string | undefined;
    let templateVariables: Record<string, string> | undefined;

    // If template is specified, resolve it
    if (dto.templateId) {
      const template = await this.consumerPrisma.whatsapp_templates.findFirst({
        where: { s_no: dto.templateId, is_deleted: false },
      });
      if (!template) {
        throw new NotFoundException('Template not found');
      }

      // Build message from template body + variables
      messageText = template.body;
      if (dto.templateVariables) {
        templateVariables = dto.templateVariables;
        for (const [key, value] of Object.entries(dto.templateVariables)) {
          messageText = messageText.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
      }

      templateName = template.meta_template_name || undefined;
    }

    if (!messageText && dto.mode === 'MANUAL') {
      throw new BadRequestException('Message text is required for manual mode');
    }

    // Select provider based on mode
    if (dto.mode === 'MANUAL') {
      const result = await this.manualProvider.sendMessage({
        phone: dto.phone,
        message: messageText,
      });

      // Log the message
      const record = await this.consumerPrisma.whatsapp_messages.create({
        data: {
          phone: dto.phone,
          message: messageText,
          template_id: dto.templateId || null,
          mode: 'MANUAL',
          status: 'LINK_GENERATED',
          sent_by: userId,
          entity_type: dto.entityType || null,
          entity_id: dto.entityId || null,
        },
      });

      return ResponseUtil.success(
        {
          id: record.s_no,
          mode: 'MANUAL',
          waLink: result.waLink,
          status: 'LINK_GENERATED',
        },
        'WhatsApp link generated successfully',
      );
    } else {
      // API mode
      const result = await this.metaProvider.sendMessage({
        phone: dto.phone,
        message: messageText,
        templateName,
        templateVariables,
      });

      const status = result.success ? 'SENT' : 'FAILED';

      const record = await this.consumerPrisma.whatsapp_messages.create({
        data: {
          phone: dto.phone,
          message: messageText,
          template_id: dto.templateId || null,
          mode: 'API',
          status: status as any,
          provider_msg_id: result.providerMessageId || null,
          sent_by: userId,
          entity_type: dto.entityType || null,
          entity_id: dto.entityId || null,
          error_message: result.error || null,
        },
      });

      if (!result.success) {
        return ResponseUtil.success(
          {
            id: record.s_no,
            mode: 'API',
            status: 'FAILED',
            error: result.error,
          },
          'Failed to send WhatsApp message',
        );
      }

      return ResponseUtil.success(
        {
          id: record.s_no,
          mode: 'API',
          status: 'SENT',
          providerMessageId: result.providerMessageId,
        },
        'WhatsApp message sent successfully',
      );
    }
  }

  async getMessageHistory(params: {
    page: number;
    limit: number;
    entityType?: string;
    entityId?: number;
    phone?: string;
  }) {
    const where: any = {};
    if (params.entityType) where.entity_type = params.entityType;
    if (params.entityId) where.entity_id = params.entityId;
    if (params.phone) where.phone = { contains: params.phone };

    const [data, total] = await Promise.all([
      this.consumerPrisma.whatsapp_messages.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          template: { select: { display_name: true, name: true } },
          user: { select: { name: true } },
        },
      }),
      this.consumerPrisma.whatsapp_messages.count({ where }),
    ]);

    return ResponseUtil.paginated(data, total, params.page, params.limit, 'Messages fetched successfully');
  }

  // Template CRUD
  async createTemplate(dto: CreateWhatsAppTemplateDto) {
    const template = await this.consumerPrisma.whatsapp_templates.create({
      data: {
        name: dto.name,
        display_name: dto.displayName,
        meta_template_name: dto.metaTemplateName || null,
        body: dto.body,
        variables: dto.variables ? JSON.stringify(dto.variables) : null,
        category: dto.category || 'UTILITY',
        language: dto.language || 'en',
        status: dto.metaTemplateName ? 'APPROVED' : 'DRAFT',
      },
    });

    return ResponseUtil.created(template, 'Template created successfully');
  }

  async listTemplates() {
    const templates = await this.consumerPrisma.whatsapp_templates.findMany({
      where: { is_deleted: false },
      orderBy: { created_at: 'desc' },
    });

    return ResponseUtil.success(templates, 'Templates fetched successfully');
  }

  async getTemplate(id: number) {
    const template = await this.consumerPrisma.whatsapp_templates.findFirst({
      where: { s_no: id, is_deleted: false },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return ResponseUtil.success(template, 'Template fetched successfully');
  }

  async deleteTemplate(id: number) {
    const template = await this.consumerPrisma.whatsapp_templates.findFirst({
      where: { s_no: id, is_deleted: false },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.consumerPrisma.whatsapp_templates.update({
      where: { s_no: id },
      data: { is_deleted: true },
    });

    return ResponseUtil.success(null, 'Template deleted successfully');
  }

  // Webhook for delivery status updates from Meta
  async handleWebhook(body: any) {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const statuses = changes?.value?.statuses;

    if (!statuses || !Array.isArray(statuses)) {
      return { received: true };
    }

    for (const statusUpdate of statuses) {
      const providerMsgId = statusUpdate.id;
      const status = statusUpdate.status?.toUpperCase(); // sent, delivered, read, failed

      if (!providerMsgId || !status) continue;

      const mappedStatus = this.mapMetaStatus(status);
      if (!mappedStatus) continue;

      await this.consumerPrisma.whatsapp_messages.updateMany({
        where: { provider_msg_id: providerMsgId },
        data: {
          status: mappedStatus as any,
          updated_at: new Date(),
          ...(status === 'FAILED' ? { error_message: statusUpdate.errors?.[0]?.title || 'Delivery failed' } : {}),
        },
      });
    }

    return { received: true };
  }

  private mapMetaStatus(status: string): string | null {
    switch (status) {
      case 'SENT': return 'SENT';
      case 'DELIVERED': return 'DELIVERED';
      case 'READ': return 'READ';
      case 'FAILED': return 'FAILED';
      default: return null;
    }
  }
}
