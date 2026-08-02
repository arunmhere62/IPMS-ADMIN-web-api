import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

const ALLOWED_DURATIONS_DAYS = [30, 180, 365] as const;

export class CreateSubscriptionPlanDto {
  @ApiProperty({ example: 'Starter' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Starter plan for small PG owners' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 30, description: 'Duration in days (30 = 1 month, 180 = 6 months, 365 = 12 months)' })
  @IsInt()
  @Min(1)
  @IsIn(ALLOWED_DURATIONS_DAYS)
  duration: number;

  @ApiProperty({ example: 999, description: 'Price amount' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: { max_support: true } })
  @IsOptional()
  @ValidateIf((o) => o.features != null && !Array.isArray(o.features))
  @IsObject()
  @ValidateIf((o) => Array.isArray(o.features))
  @IsArray()
  features?: Record<string, any>;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_pg_locations?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_tenants?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_rooms?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_beds?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_employees?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_users?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_invoices_per_month?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_sms_per_month?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Marks plan as free plan' })
  @IsOptional()
  @IsBoolean()
  is_free?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Marks plan as trial plan (auto-assigned at signup)' })
  @IsOptional()
  @IsBoolean()
  is_trial?: boolean;
}
