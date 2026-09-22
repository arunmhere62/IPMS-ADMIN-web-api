import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

export class TestWhatsAppDto {
  @ApiProperty({ example: '919876543210', description: 'Recipient phone number with country code, digits only' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{8,15}$/, { message: 'Phone number must be 8-15 digits with country code, no + or separators' })
  phone: string;

  @ApiPropertyOptional({ example: 'Test campaign' })
  @IsOptional()
  @IsString()
  campaignName?: string;

  @ApiPropertyOptional({
    example: { recipient_name: 'Arun', pg_name: 'Sunrise PG' },
    description: 'Template body variables. For default tenant app template: recipient_name and pg_name.',
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @ApiPropertyOptional({ example: '1610601234193277' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ example: 'en_US' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/tenant-app-download-video.mp4',
    description: 'Public media URL required when the template has an image/video/document header.',
  })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'mediaUrl must be a valid URL' })
  mediaUrl?: string;

  @ApiPropertyOptional({
    example: '1385973193162058',
    description: 'SmartGrowth media id required when the template has an image/video/document header.',
  })
  @IsOptional()
  @IsString()
  mediaId?: string;
}
