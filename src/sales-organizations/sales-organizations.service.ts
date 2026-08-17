import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { CreateSalesOrganizationDto } from './dto/create-sales-organization.dto';
import { UpdateSalesOrganizationDto } from './dto/update-sales-organization.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

interface ListParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class SalesOrganizationsService {
  constructor(private readonly managementPrisma: ManagementPrismaService) {}

  async findAll(params: ListParams) {
    const { page, limit, search, status, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (status) {
      where.status = status;
    }

    const allowedSortColumns = ['name', 'status', 'created_at', 'updated_at'];
    const orderByColumn = allowedSortColumns.includes(sortBy ?? '') ? sortBy! : 'created_at';
    const orderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    const [orgs, total] = await Promise.all([
      this.managementPrisma.sales_organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderByColumn]: orderByDirection },
        include: {
          _count: { select: { user: true } },
        },
      }),
      this.managementPrisma.sales_organization.count({ where }),
    ]);

    const result = orgs.map((org) => ({
      ...org,
      employee_count: org._count.user,
      _count: undefined,
    }));

    return ResponseUtil.paginated(result, total, page, limit, 'Sales organizations fetched successfully');
  }

  async findAllActive() {
    const orgs = await this.managementPrisma.sales_organization.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { s_no: true, name: true, status: true },
    });
    return ResponseUtil.success(orgs, 'Active sales organizations fetched successfully');
  }

  async findOne(id: number) {
    const org = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: id },
      include: {
        _count: { select: { user: true } },
      },
    });

    if (!org) {
      throw new NotFoundException('Sales organization not found');
    }

    const result = {
      ...org,
      employee_count: org._count.user,
      _count: undefined,
    };

    return ResponseUtil.success(result, 'Sales organization fetched successfully');
  }

  async findEmployees(id: number, params: { page: number; limit: number; search?: string }) {
    const org = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: id },
    });
    if (!org) {
      throw new NotFoundException('Sales organization not found');
    }

    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: any = { organization_id: id };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.managementPrisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          role: { select: { s_no: true, name: true, description: true } },
        },
      }),
      this.managementPrisma.user.count({ where }),
    ]);

    return ResponseUtil.paginated(users, total, page, limit, 'Employees fetched successfully');
  }

  async create(dto: CreateSalesOrganizationDto) {
    const existing = await this.managementPrisma.sales_organization.findFirst({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Sales organization with name "${dto.name}" already exists`);
    }

    const created = await this.managementPrisma.sales_organization.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
      },
      include: {
        _count: { select: { user: true } },
      },
    });

    const result = {
      ...created,
      employee_count: created._count.user,
      _count: undefined,
    };

    return ResponseUtil.created(result, 'Sales organization created successfully');
  }

  async update(id: number, dto: UpdateSalesOrganizationDto) {
    const existing = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: id },
    });
    if (!existing) {
      throw new NotFoundException('Sales organization not found');
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.managementPrisma.sales_organization.findFirst({
        where: { name: dto.name, s_no: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Sales organization with name "${dto.name}" already exists`);
      }
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;

    const updated = await this.managementPrisma.sales_organization.update({
      where: { s_no: id },
      data,
      include: {
        _count: { select: { user: true } },
      },
    });

    const result = {
      ...updated,
      employee_count: updated._count.user,
      _count: undefined,
    };

    return ResponseUtil.success(result, 'Sales organization updated successfully');
  }

  async deactivate(id: number) {
    const existing = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: id },
    });
    if (!existing) {
      throw new NotFoundException('Sales organization not found');
    }

    if (existing.status === 'INACTIVE') {
      throw new BadRequestException('Sales organization is already inactive');
    }

    const updated = await this.managementPrisma.sales_organization.update({
      where: { s_no: id },
      data: { status: 'INACTIVE' },
      include: {
        _count: { select: { user: true } },
      },
    });

    const result = {
      ...updated,
      employee_count: updated._count.user,
      _count: undefined,
    };

    return ResponseUtil.success(result, 'Sales organization deactivated successfully');
  }

  async reactivate(id: number) {
    const existing = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: id },
    });
    if (!existing) {
      throw new NotFoundException('Sales organization not found');
    }

    if (existing.status === 'ACTIVE') {
      throw new BadRequestException('Sales organization is already active');
    }

    const updated = await this.managementPrisma.sales_organization.update({
      where: { s_no: id },
      data: { status: 'ACTIVE' },
      include: {
        _count: { select: { user: true } },
      },
    });

    const result = {
      ...updated,
      employee_count: updated._count.user,
      _count: undefined,
    };

    return ResponseUtil.success(result, 'Sales organization reactivated successfully');
  }

  // ─── Employee (user) management, scoped to a sales organization ───

  async createEmployee(orgId: number, dto: CreateEmployeeDto) {
    const org = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: orgId },
    });
    if (!org) {
      throw new NotFoundException('Sales organization not found');
    }
    if (org.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Sales organization "${org.name}" is not active. Cannot add employees to it.`,
      );
    }

    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Either email or phone is required');
    }

    const role = await this.managementPrisma.role.findUnique({ where: { s_no: dto.role_id } });
    if (!role) {
      throw new NotFoundException(`Role with id ${dto.role_id} not found`);
    }
    if (role.name === 'SUPER_ADMIN') {
      throw new BadRequestException(
        'SUPER_ADMIN role cannot be assigned to organization employees.',
      );
    }

    if (dto.email) {
      const existingEmail = await this.managementPrisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail) {
        throw new ConflictException(`User with email "${dto.email}" already exists`);
      }
    }
    if (dto.phone) {
      const existingPhone = await this.managementPrisma.user.findUnique({ where: { phone: dto.phone } });
      if (existingPhone) {
        throw new ConflictException(`User with phone "${dto.phone}" already exists`);
      }
    }

    const created = await this.managementPrisma.user.create({
      data: {
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        role_id: dto.role_id,
        organization_id: orgId,
        is_active: dto.is_active ?? true,
      },
      include: {
        role: { select: { s_no: true, name: true, description: true } },
        sales_organization: { select: { s_no: true, name: true, status: true } },
      },
    });

    return ResponseUtil.created(created, 'Employee created successfully');
  }

  async updateEmployee(orgId: number, userId: number, dto: UpdateEmployeeDto) {
    const org = await this.managementPrisma.sales_organization.findUnique({
      where: { s_no: orgId },
    });
    if (!org) {
      throw new NotFoundException('Sales organization not found');
    }

    const user = await this.managementPrisma.user.findUnique({ where: { s_no: userId } });
    if (!user) {
      throw new NotFoundException('Employee not found');
    }
    if (user.organization_id !== orgId) {
      throw new BadRequestException('This employee does not belong to the specified organization.');
    }

    if (dto.role_id !== undefined) {
      const role = await this.managementPrisma.role.findUnique({ where: { s_no: dto.role_id } });
      if (!role) {
        throw new NotFoundException(`Role with id ${dto.role_id} not found`);
      }
      if (role.name === 'SUPER_ADMIN') {
        throw new BadRequestException(
          'SUPER_ADMIN role cannot be assigned to organization employees.',
        );
      }
    }

    if (dto.email && dto.email !== user.email) {
      const existingEmail = await this.managementPrisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail && existingEmail.s_no !== userId) {
        throw new ConflictException(`User with email "${dto.email}" already exists`);
      }
    }

    if (dto.phone && dto.phone !== user.phone) {
      const existingPhone = await this.managementPrisma.user.findUnique({ where: { phone: dto.phone } });
      if (existingPhone && existingPhone.s_no !== userId) {
        throw new ConflictException(`User with phone "${dto.phone}" already exists`);
      }
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.role_id !== undefined) data.role_id = dto.role_id;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;

    const updated = await this.managementPrisma.user.update({
      where: { s_no: userId },
      data,
      include: {
        role: { select: { s_no: true, name: true, description: true } },
        sales_organization: { select: { s_no: true, name: true, status: true } },
      },
    });

    return ResponseUtil.success(updated, 'Employee updated successfully');
  }

  async deactivateEmployee(orgId: number, userId: number) {
    const user = await this.managementPrisma.user.findUnique({ where: { s_no: userId } });
    if (!user) {
      throw new NotFoundException('Employee not found');
    }
    if (user.organization_id !== orgId) {
      throw new BadRequestException('This employee does not belong to the specified organization.');
    }

    const updated = await this.managementPrisma.user.update({
      where: { s_no: userId },
      data: { is_active: false },
      include: {
        role: { select: { s_no: true, name: true, description: true } },
        sales_organization: { select: { s_no: true, name: true, status: true } },
      },
    });

    return ResponseUtil.success(updated, 'Employee deactivated successfully');
  }

  async reactivateEmployee(orgId: number, userId: number) {
    const user = await this.managementPrisma.user.findUnique({ where: { s_no: userId } });
    if (!user) {
      throw new NotFoundException('Employee not found');
    }
    if (user.organization_id !== orgId) {
      throw new BadRequestException('This employee does not belong to the specified organization.');
    }

    const updated = await this.managementPrisma.user.update({
      where: { s_no: userId },
      data: { is_active: true },
      include: {
        role: { select: { s_no: true, name: true, description: true } },
        sales_organization: { select: { s_no: true, name: true, status: true } },
      },
    });

    return ResponseUtil.success(updated, 'Employee reactivated successfully');
  }
}
