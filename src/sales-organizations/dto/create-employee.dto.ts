import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+91 9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]+$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @ApiProperty({ example: 2, description: 'Role ID (from /roles)' })
  @IsInt()
  role_id: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'At least one of email or phone must be provided',
  })
  @ValidateIf((o) => !o.email && !o.phone)
  @IsNotEmpty({ message: 'Either email or phone is required' })
  contact_required?: string;
}
