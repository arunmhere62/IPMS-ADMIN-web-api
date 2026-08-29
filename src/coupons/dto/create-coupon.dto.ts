import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ example: 'SAVE10', description: 'Unique coupon code (uppercase)' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: '10% off for first 100 users' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'PERCENTAGE', enum: ['PERCENTAGE', 'FLAT_AMOUNT'] })
  @IsIn(['PERCENTAGE', 'FLAT_AMOUNT'])
  discount_type: 'PERCENTAGE' | 'FLAT_AMOUNT';

  @ApiProperty({ example: 10, description: 'Percentage (0-100) or flat amount in currency' })
  @IsNumber()
  @Min(0.01)
  discount_value: number;

  @ApiPropertyOptional({ example: 500, description: 'Max discount cap (for percentage). null = no cap' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_discount_amount?: number | null;

  @ApiPropertyOptional({ example: 100, description: 'Minimum order amount for coupon to apply' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_amount?: number;

  @ApiPropertyOptional({ example: 100, description: 'Max total uses. null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses?: number | null;

  @ApiPropertyOptional({ example: 1, description: 'Max uses per user. Default: 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses_per_user?: number;

  @ApiPropertyOptional({ example: [1, 2, 3], description: 'Plan IDs this coupon applies to. null = all plans' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  applicable_plan_ids?: number[] | null;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Valid from date (YYYY-MM-DD). Defaults to now' })
  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Valid until date (YYYY-MM-DD). null = no expiry' })
  @IsOptional()
  @IsDateString()
  valid_until?: string | null;

  @ApiPropertyOptional({ example: true, description: 'Whether coupon is active' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
