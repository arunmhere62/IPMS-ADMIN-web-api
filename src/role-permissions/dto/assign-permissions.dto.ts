import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({
    example: ['tenants_view', 'tenants_delete'],
    description: 'Permission keys in the format screen_action (example: tenants_view)',
  })
  @IsArray()
  @IsString({ each: true })
  permission_keys: string[];

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  replace_all?: boolean;
}

export class BulkPermissionUpdateDto {
  @ApiProperty({
    example: { tenants_view: true, tenants_delete: false },
    description: 'Map of permission_key -> boolean (true = granted). Keys must be screen_action',
  })
  @IsObject()
  @IsNotEmpty()
  permissions: Record<string, boolean>;
}
