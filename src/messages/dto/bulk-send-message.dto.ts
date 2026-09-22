import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { whatsapp_messages_channel } from '@prisma/client-consumer';
import { MessageEntityType, WhatsAppSendMode } from './send-message.dto';

export class BulkSendMessageDto {
  @ApiProperty({ enum: whatsapp_messages_channel, example: 'WHATSAPP' })
  @IsEnum(whatsapp_messages_channel)
  channel: whatsapp_messages_channel;

  @ApiProperty({ enum: MessageEntityType, example: 'TENANT' })
  @IsEnum(MessageEntityType)
  entity_type: MessageEntityType;

  @ApiProperty({ example: [1, 2, 3], description: 'List of entity ids to send to' })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1, { message: 'At least one entity id is required' })
  entity_ids: number[];

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  template_id?: number;

  @ApiPropertyOptional({ enum: WhatsAppSendMode, example: 'API' })
  @IsOptional()
  @IsEnum(WhatsAppSendMode)
  send_mode?: WhatsAppSendMode;

  @ApiPropertyOptional({ example: 'Hello {{recipient_name}}' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @ApiPropertyOptional({ example: { custom_note: 'Rent due on 5th' } })
  @IsOptional()
  @IsObject()
  manual_variables?: Record<string, string>;
}
