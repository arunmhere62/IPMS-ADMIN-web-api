import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum SubscriptionPaymentStatus {
  INITIATED = 'INITIATED',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  ABORTED = 'ABORTED',
  PENDING = 'PENDING',
}

export class UpdatePaymentStatusDto {
  @ApiProperty({
    enum: SubscriptionPaymentStatus,
    example: 'SUCCESS',
    description: 'New payment status',
  })
  @IsEnum(SubscriptionPaymentStatus)
  status: SubscriptionPaymentStatus;

  @ApiPropertyOptional({
    example: 'Manually verified by admin',
    description: 'Optional note explaining the status change',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
