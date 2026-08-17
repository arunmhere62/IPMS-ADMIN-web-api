import { Injectable, NotFoundException } from '@nestjs/common';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';

@Injectable()
export class UsersService {
  constructor(private readonly managementPrisma: ManagementPrismaService) {}

  async findOne(id: number) {
    const user = await this.managementPrisma.user.findUnique({
      where: { s_no: id },
      include: {
        role: { select: { s_no: true, name: true, description: true } },
        sales_organization: { select: { s_no: true, name: true, status: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return ResponseUtil.success(user, 'User fetched successfully');
  }
}
