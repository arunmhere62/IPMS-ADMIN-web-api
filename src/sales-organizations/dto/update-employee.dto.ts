import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+91 9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]+$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 2, description: 'Role ID' })
  @IsOptional()
  @IsInt()
  role_id?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
