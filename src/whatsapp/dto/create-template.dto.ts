import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWhatsAppTemplateDto {
  @ApiProperty({ description: 'Unique template name (slug)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiPropertyOptional({ description: 'Meta-approved template name (for API mode)' })
  @IsString()
  @IsOptional()
  metaTemplateName?: string;

  @ApiProperty({ description: 'Message body. Use {{variable_name}} for variables.' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'Variable definitions as JSON array of variable names' })
  @IsOptional()
  variables?: string[];

  @ApiPropertyOptional({ enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION'] })
  @IsEnum(['UTILITY', 'MARKETING', 'AUTHENTICATION'])
  @IsOptional()
  category?: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

  @ApiPropertyOptional({ description: 'Language code', default: 'en' })
  @IsString()
  @IsOptional()
  language?: string;
}
