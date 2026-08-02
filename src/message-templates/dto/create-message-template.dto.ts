import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsArray,
} from 'class-validator';
import { whatsapp_templates_channel, whatsapp_templates_lifecycle_status } from '@prisma/client-consumer';

export class CreateMessageTemplateDto {
  @ApiProperty({ example: 'rent_reminder' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Rent Reminder' })
  @IsString()
  @IsNotEmpty()
  display_name: string;

  @ApiPropertyOptional({ example: 'utility' })
  @IsOptional()
  @IsString()
  meta_template_name?: string;

  @ApiProperty({ example: 'Hi {{recipient_name}}, your rent is due.' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ example: 'Rent Due' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ enum: whatsapp_templates_channel })
  @IsOptional()
  @IsEnum(whatsapp_templates_channel)
  channel?: whatsapp_templates_channel;

  @ApiPropertyOptional({ example: ['TENANT'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['TENANT', 'EMPLOYEE', 'CONTACT', 'LEAD', 'USER'], { each: true })
  recipient_types?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_system?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  organization_id?: number;

  @ApiPropertyOptional({ enum: whatsapp_templates_lifecycle_status })
  @IsOptional()
  @IsEnum(whatsapp_templates_lifecycle_status)
  lifecycle_status?: whatsapp_templates_lifecycle_status;
}
