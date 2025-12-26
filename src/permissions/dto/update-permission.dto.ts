import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { permissions_master_action } from '@prisma/client-consumer';

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'tenants' })
  @IsOptional()
  @IsString()
  screen_name?: string;

  @ApiPropertyOptional({ enum: permissions_master_action, example: permissions_master_action.VIEW })
  @IsOptional()
  @IsEnum(permissions_master_action)
  action?: permissions_master_action;

  @ApiPropertyOptional({ example: 'Allows viewing tenants' })
  @IsOptional()
  @IsString()
  description?: string;
}
