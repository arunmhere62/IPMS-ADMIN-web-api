import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'a1b2c3d4e5f6...', description: 'Refresh token received during login' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
