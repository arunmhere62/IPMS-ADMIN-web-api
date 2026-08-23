import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum UserSubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING',
}

export class UpdateUserSubscriptionStatusDto {
  @ApiProperty({
    enum: UserSubscriptionStatus,
    example: 'ACTIVE',
    description: 'New user subscription status',
  })
  @IsEnum(UserSubscriptionStatus)
  status: UserSubscriptionStatus;

  @ApiPropertyOptional({
    example: 'Manually activated by admin',
    description: 'Optional note explaining the status change',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
