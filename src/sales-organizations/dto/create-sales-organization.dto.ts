import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSalesOrganizationDto {
  @ApiProperty({ example: 'Acme Sales Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'North zone sales partner' })
  @IsOptional()
  @IsString()
  description?: string;
}
