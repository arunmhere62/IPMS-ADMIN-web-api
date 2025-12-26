import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { permissions_master_action } from '@prisma/client-consumer';

export class CreatePermissionDto {
  @ApiProperty({ example: 'tenants' })
  @IsString()
  @IsNotEmpty()
  screen_name: string;

  @ApiProperty({ enum: permissions_master_action, example: permissions_master_action.VIEW })
  @IsEnum(permissions_master_action)
  action: permissions_master_action;

  @ApiPropertyOptional({ example: 'Allows viewing tenants' })
  @IsOptional()
  @IsString()
  description?: string;
}
