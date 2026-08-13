import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Platform {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  BOTH = 'BOTH',
}

export class CreateVersionDto {
  @ApiProperty({ description: 'Version string e.g. "1.0.0"' })
  @IsString()
  @MaxLength(20)
  version: string;

  @ApiProperty({ enum: Platform, default: Platform.BOTH })
  @IsEnum(Platform)
  platform: Platform;

  @ApiPropertyOptional({ description: 'Version code (integer)' })
  @IsOptional()
  @IsInt()
  version_code?: number;

  @ApiPropertyOptional({ description: 'Release notes for this version' })
  @IsOptional()
  @IsString()
  release_notes?: string;

  @ApiPropertyOptional({ description: 'Store URL (Play Store / App Store)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  store_url?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Force update for this version' })
  @IsOptional()
  @IsBoolean()
  is_force_update?: boolean;
}
