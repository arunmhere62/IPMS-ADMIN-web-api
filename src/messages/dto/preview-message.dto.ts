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
import { MessageEntityType } from './send-message.dto';

export class PreviewMessageDto {
  @ApiProperty({ enum: whatsapp_messages_channel, example: 'WHATSAPP' })
  @IsEnum(whatsapp_messages_channel)
  channel: whatsapp_messages_channel;

  @ApiProperty({ enum: MessageEntityType, example: 'TENANT' })
  @IsEnum(MessageEntityType)
  entity_type: MessageEntityType;

  @ApiProperty({ example: 1 })
  @IsInt()
  entity_id: number;

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
