import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { whatsapp_messages_channel } from '@prisma/client-consumer';

export enum MessageEntityType {
  TENANT = 'TENANT',
  CONTACT = 'CONTACT',
  LEAD = 'LEAD',
  USER = 'USER',
}

export enum WhatsAppSendMode {
  MANUAL = 'MANUAL',
  API = 'API',
}

export class SendMessageDto {
  @ApiProperty({ enum: whatsapp_messages_channel, example: 'WHATSAPP' })
  @IsEnum(whatsapp_messages_channel)
  channel: whatsapp_messages_channel;

  @ApiProperty({ enum: MessageEntityType, example: 'TENANT' })
  @IsEnum(MessageEntityType)
  entity_type: MessageEntityType;

  @ApiProperty({ example: 1 })
  @IsInt()
  entity_id: number;

  @ApiPropertyOptional({ enum: WhatsAppSendMode, example: 'MANUAL', description: 'WhatsApp only: MANUAL generates wa.me link, API sends via Meta. Defaults to auto-detect from env.' })
  @IsOptional()
  @IsEnum(WhatsAppSendMode)
  send_mode?: WhatsAppSendMode;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  template_id?: number;

  @ApiPropertyOptional({ example: 'Hello {{recipient_name}}' })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.template_id)
  @IsNotEmpty()
  body?: string;

  @ApiPropertyOptional({ example: 'Reminder' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: { custom_note: 'Rent due on 5th' } })
  @IsOptional()
  @IsObject()
  manual_variables?: Record<string, string>;
}
