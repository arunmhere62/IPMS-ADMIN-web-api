import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SendWhatsAppMessageDto {
  @ApiProperty({ description: 'Phone number with country code (e.g. 919876543210)' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ enum: ['MANUAL', 'API'], description: 'Send mode' })
  @IsEnum(['MANUAL', 'API'])
  mode: 'MANUAL' | 'API';

  @ApiPropertyOptional({ description: 'Message text (required for manual mode or free-form API)' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Template ID for API mode' })
  @IsNumber()
  @IsOptional()
  templateId?: number;

  @ApiPropertyOptional({ description: 'Template variables as key-value pairs' })
  @IsOptional()
  templateVariables?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Entity type (TENANT, LEAD, CONTACT)' })
  @IsString()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Entity ID' })
  @IsNumber()
  @IsOptional()
  entityId?: number;
}
