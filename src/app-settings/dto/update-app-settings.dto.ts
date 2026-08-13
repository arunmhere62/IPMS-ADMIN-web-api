import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAppSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_maintenance_mode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenance_message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_registration_open?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force_update_android?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force_update_ios?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  android_store_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ios_store_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  current_version_android?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  current_version_ios?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  minimum_version_android?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  minimum_version_ios?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payment_gateway_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_announcement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  announcement_title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  announcement_message?: string;
}
