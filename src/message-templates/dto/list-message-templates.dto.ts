import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { whatsapp_templates_channel } from '@prisma/client-consumer';

export class ListMessageTemplatesDto {
  @ApiPropertyOptional({ enum: whatsapp_templates_channel })
  @IsOptional()
  @IsEnum(whatsapp_templates_channel)
  channel?: whatsapp_templates_channel;

  @ApiPropertyOptional({ example: 'TENANT' })
  @IsOptional()
  @IsString()
  @IsIn(['TENANT', 'EMPLOYEE', 'CONTACT', 'LEAD', 'USER'])
  recipient_type?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}
