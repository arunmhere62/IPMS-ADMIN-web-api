import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async findAll() {
    const roles = await this.consumerPrisma.roles.findMany({
      where: { is_deleted: false },
      orderBy: { created_at: 'desc' },
    });

    return ResponseUtil.success(roles, 'Roles fetched successfully');
  }

  async findOne(id: number) {
    const role = await this.consumerPrisma.roles.findFirst({
      where: { s_no: id, is_deleted: false },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return ResponseUtil.success(role, 'Role fetched successfully');
  }

  async create(dto: CreateRoleDto) {
    const created = await this.consumerPrisma.roles.create({
      data: {
        role_name: dto.role_name,
        status: dto.status as any,
      },
    });

    return ResponseUtil.created(created, 'Role created successfully');
  }

  async update(id: number, dto: UpdateRoleDto) {
    const existing = await this.consumerPrisma.roles.findFirst({
      where: { s_no: id, is_deleted: false },
    });

    if (!existing) {
      throw new NotFoundException('Role not found');
    }

    const updated = await this.consumerPrisma.roles.update({
      where: { s_no: id },
      data: {
        role_name: dto.role_name,
        status: dto.status as any,
      },
    });

    return ResponseUtil.success(updated, 'Role updated successfully');
  }

  async remove(id: number) {
    const existing = await this.consumerPrisma.roles.findFirst({
      where: { s_no: id, is_deleted: false },
    });

    if (!existing) {
      throw new NotFoundException('Role not found');
    }

    const updated = await this.consumerPrisma.roles.update({
      where: { s_no: id },
      data: { is_deleted: true },
    });

    return ResponseUtil.success(updated, 'Role deleted successfully');
  }
}
