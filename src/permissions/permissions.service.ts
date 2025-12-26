import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async findAll() {
    const permissions = await this.consumerPrisma.permissions_master.findMany({
      orderBy: [{ screen_name: 'asc' }, { action: 'asc' }],
    });

    return ResponseUtil.success(permissions, 'Permissions fetched successfully');
  }

  async findOne(id: number) {
    const permission = await this.consumerPrisma.permissions_master.findUnique({
      where: { s_no: id },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return ResponseUtil.success(permission, 'Permission fetched successfully');
  }

  async create(dto: CreatePermissionDto) {
    const created = await this.consumerPrisma.permissions_master.create({
      data: {
        screen_name: dto.screen_name,
        action: dto.action,
        description: dto.description,
      },
    });

    return ResponseUtil.created(created, 'Permission created successfully');
  }

  async update(id: number, dto: UpdatePermissionDto) {
    const existing = await this.consumerPrisma.permissions_master.findUnique({
      where: { s_no: id },
    });

    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    const updated = await this.consumerPrisma.permissions_master.update({
      where: { s_no: id },
      data: {
        screen_name: dto.screen_name,
        action: dto.action,
        description: dto.description,
      },
    });

    return ResponseUtil.success(updated, 'Permission updated successfully');
  }

  async remove(id: number) {
    const existing = await this.consumerPrisma.permissions_master.findUnique({
      where: { s_no: id },
    });

    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    const [roleUsageCount, userOverrideCount] = await Promise.all([
      this.consumerPrisma.role_permissions.count({
        where: { permission_id: id },
      }),
      this.consumerPrisma.user_permission_overrides.count({
        where: { permission_id: id },
      }),
    ]);

    if (roleUsageCount > 0 || userOverrideCount > 0) {
      throw new ConflictException(
        `Cannot delete permission. It is being used by ${roleUsageCount} role permission assignment(s) and ${userOverrideCount} user override(s)`,
      );
    }

    await this.consumerPrisma.permissions_master.delete({
      where: { s_no: id },
    });

    return ResponseUtil.noContent('Permission deleted successfully');
  }
}
