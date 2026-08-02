import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { ListMessageTemplatesDto } from './dto/list-message-templates.dto';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@Injectable()
export class MessageTemplatesService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async findAll(params: ListMessageTemplatesDto) {
    const where: any = { is_deleted: false };

    if (params.channel) {
      where.channel = params.channel;
    }

    if (params.status) {
      where.lifecycle_status = params.status;
    } else {
      where.lifecycle_status = 'ACTIVE';
    }

    let templates = await this.consumerPrisma.whatsapp_templates.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    if (params.recipient_type) {
      templates = templates.filter((template) => {
        const types = template.recipient_types as any;
        if (!types) return true;
        if (Array.isArray(types)) return types.includes(params.recipient_type);
        return false;
      });
    }

    return ResponseUtil.success(templates, 'Templates retrieved successfully');
  }

  async findOne(id: number) {
    const template = await this.consumerPrisma.whatsapp_templates.findUnique({
      where: { s_no: id, is_deleted: false },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return ResponseUtil.success(template, 'Template retrieved successfully');
  }

  async create(dto: CreateMessageTemplateDto) {
    const template = await this.consumerPrisma.whatsapp_templates.create({
      data: {
        name: dto.name,
        display_name: dto.display_name,
        meta_template_name: dto.meta_template_name || null,
        body: dto.body,
        subject: dto.subject || null,
        channel: dto.channel || 'WHATSAPP',
        recipient_types: dto.recipient_types as any,
        is_system: dto.is_system ?? false,
        organization_id: dto.organization_id || null,
        lifecycle_status: dto.lifecycle_status || 'ACTIVE',
      } as any,
    });

    return ResponseUtil.created(template, 'Template created successfully');
  }

  async update(id: number, dto: UpdateMessageTemplateDto) {
    await this.findOne(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.display_name !== undefined) data.display_name = dto.display_name;
    if (dto.meta_template_name !== undefined) data.meta_template_name = dto.meta_template_name;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.channel !== undefined) data.channel = dto.channel;
    if (dto.recipient_types !== undefined) data.recipient_types = dto.recipient_types as any;
    if (dto.is_system !== undefined) data.is_system = dto.is_system;
    if (dto.organization_id !== undefined) data.organization_id = dto.organization_id;
    if (dto.lifecycle_status !== undefined) data.lifecycle_status = dto.lifecycle_status;
    data.updated_at = new Date();

    const template = await this.consumerPrisma.whatsapp_templates.update({
      where: { s_no: id },
      data,
    });

    return ResponseUtil.success(template, 'Template updated successfully');
  }

  async remove(id: number) {
    await this.findOne(id);

    const template = await this.consumerPrisma.whatsapp_templates.update({
      where: { s_no: id },
      data: { is_deleted: true, updated_at: new Date() },
    });

    return ResponseUtil.success(template, 'Template deleted successfully');
  }
}
