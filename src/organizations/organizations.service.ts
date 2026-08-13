import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';
import { Prisma } from '@prisma/client-consumer';

interface ListOrganizationsParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  deleted?: boolean;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async listOrganizations(params: ListOrganizationsParams) {
    const { page, limit, search, status, sortBy, sortOrder, deleted } = params;
    const skip = (page - 1) * limit;

    const whereOrganizations: any = {
      is_deleted: Boolean(deleted),
    };

    if (search) {
      whereOrganizations.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (status) {
      whereOrganizations.status = status;
    }

    const allowedSortColumns = ['name', 'status', 'created_at', 'updated_at'];
    const orderByColumn = allowedSortColumns.includes(sortBy ?? '') ? sortBy! : 'created_at';
    const orderByDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, organizations] = await Promise.all([
      this.consumerPrisma.organization.count({ where: whereOrganizations }),
      this.consumerPrisma.organization.findMany({
        where: whereOrganizations,
        skip,
        take: limit,
        orderBy: { [orderByColumn]: orderByDir },
        select: {
          s_no: true,
          name: true,
          description: true,
          status: true,
          is_deleted: true,
          superadmin_id: true,
          created_at: true,
          updated_at: true,
          pg_locations: {
            where: { is_deleted: false },
            select: {
              s_no: true,
              location_name: true,
              address: true,
              status: true,
              rooms: {
                where: { is_deleted: false },
                select: {
                  s_no: true,
                  beds: {
                    where: { is_deleted: false },
                    select: { s_no: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const pgIds = organizations.flatMap((o) => o.pg_locations.map((pg) => pg.s_no));

    const [employeesGrouped, tenantsGrouped] = await Promise.all([
      pgIds.length
        ? this.consumerPrisma.$queryRaw<Array<{ pg_id: number | null; _count: number }>>(
            Prisma.sql`
              SELECT pu.pg_id AS pg_id, CAST(COUNT(*) AS UNSIGNED) AS _count
              FROM pg_users pu
              INNER JOIN users u ON u.s_no = pu.user_id
              WHERE u.is_deleted = 0 AND pu.pg_id IN (${Prisma.join(pgIds)})
              GROUP BY pu.pg_id
            `
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
      pgIds.length
        ? this.consumerPrisma.$queryRaw<Array<{ pg_id: number | null; _count: number }>>(
            Prisma.sql`
              SELECT t.pg_id AS pg_id, CAST(COUNT(*) AS UNSIGNED) AS _count
              FROM tenants t
              WHERE t.is_deleted = 0 AND t.pg_id IN (${Prisma.join(pgIds)})
              GROUP BY t.pg_id
            `
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
    ]);

    const employeesByPgId = new Map<number, number>();
    for (const row of employeesGrouped) {
      if (row.pg_id != null) {
        employeesByPgId.set(row.pg_id, Number(row._count ?? 0));
      }
    }

    const tenantsByPgId = new Map<number, number>();
    for (const row of tenantsGrouped) {
      if (row.pg_id != null) {
        tenantsByPgId.set(row.pg_id, Number(row._count ?? 0));
      }
    }

    const transformed = organizations.map((org) => {
      const pgLocations = org.pg_locations.map((pg) => {
        const roomsCount = pg.rooms.length;
        const bedsCount = pg.rooms.reduce((sum, r) => sum + r.beds.length, 0);
        const employeesCount = employeesByPgId.get(pg.s_no) ?? 0;
        const tenantsCount = tenantsByPgId.get(pg.s_no) ?? 0;

        return {
          s_no: pg.s_no,
          location_name: pg.location_name,
          address: pg.address,
          status: pg.status,
          rooms_count: roomsCount,
          beds_count: bedsCount,
          employees_count: employeesCount,
          tenants_count: tenantsCount,
        };
      });

      const roomsCount = pgLocations.reduce((sum, pg) => sum + pg.rooms_count, 0);
      const bedsCount = pgLocations.reduce((sum, pg) => sum + pg.beds_count, 0);
      const employeesCount = pgLocations.reduce((sum, pg) => sum + pg.employees_count, 0);
      const tenantsCount = pgLocations.reduce((sum, pg) => sum + pg.tenants_count, 0);

      return {
        s_no: org.s_no,
        name: org.name,
        description: org.description,
        status: org.status,
        is_deleted: org.is_deleted,
        superadmin_id: org.superadmin_id,
        created_at: org.created_at,
        updated_at: org.updated_at,
        pg_locations_count: pgLocations.length,
        rooms_count: roomsCount,
        beds_count: bedsCount,
        employees_count: employeesCount,
        tenants_count: tenantsCount,
        pg_locations: pgLocations,
      };
    });

    return ResponseUtil.paginated(
      transformed,
      total,
      page,
      limit,
      'Organizations fetched successfully',
    );
  }

  async getOrganizationDetails(organizationId: number) {
    const org = await this.consumerPrisma.organization.findUnique({
      where: {
        s_no: organizationId,
      },
      select: {
        s_no: true,
        name: true,
        description: true,
        status: true,
        is_deleted: true,
        superadmin_id: true,
        created_at: true,
        updated_at: true,
        pg_locations: {
          where: { is_deleted: false },
          select: {
            s_no: true,
            location_name: true,
            address: true,
            status: true,
            created_at: true,
            updated_at: true,
            rooms: {
              where: { is_deleted: false },
              select: {
                s_no: true,
                beds: {
                  where: { is_deleted: false },
                  select: { s_no: true },
                },
              },
            },
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const pgIds = org.pg_locations.map((pg) => pg.s_no);

    const [employeesGrouped, tenantsGrouped] = await Promise.all([
      pgIds.length
        ? this.consumerPrisma.$queryRaw<Array<{ pg_id: number | null; _count: number }>>(
            Prisma.sql`
              SELECT pu.pg_id AS pg_id, CAST(COUNT(*) AS UNSIGNED) AS _count
              FROM pg_users pu
              INNER JOIN users u ON u.s_no = pu.user_id
              WHERE u.is_deleted = 0 AND pu.pg_id IN (${Prisma.join(pgIds)})
              GROUP BY pu.pg_id
            `
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
      pgIds.length
        ? this.consumerPrisma.$queryRaw<Array<{ pg_id: number | null; _count: number }>>(
            Prisma.sql`
              SELECT t.pg_id AS pg_id, CAST(COUNT(*) AS UNSIGNED) AS _count
              FROM tenants t
              WHERE t.is_deleted = 0 AND t.pg_id IN (${Prisma.join(pgIds)})
              GROUP BY t.pg_id
            `
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
    ]);

    const employeesByPgId = new Map<number, number>();
    for (const row of employeesGrouped) {
      if (row.pg_id != null) {
        employeesByPgId.set(row.pg_id, Number(row._count ?? 0));
      }
    }

    const tenantsByPgId = new Map<number, number>();
    for (const row of tenantsGrouped) {
      if (row.pg_id != null) {
        tenantsByPgId.set(row.pg_id, Number(row._count ?? 0));
      }
    }

    const pgLocations = org.pg_locations.map((pg) => {
      const roomsCount = pg.rooms.length;
      const bedsCount = pg.rooms.reduce((sum, r) => sum + r.beds.length, 0);
      const employeesCount = employeesByPgId.get(pg.s_no) ?? 0;
      const tenantsCount = tenantsByPgId.get(pg.s_no) ?? 0;

      return {
        s_no: pg.s_no,
        location_name: pg.location_name,
        address: pg.address,
        status: pg.status,
        created_at: pg.created_at,
        updated_at: pg.updated_at,
        rooms_count: roomsCount,
        beds_count: bedsCount,
        employees_count: employeesCount,
        tenants_count: tenantsCount,
      };
    });

    const roomsCount = pgLocations.reduce((sum, pg) => sum + pg.rooms_count, 0);
    const bedsCount = pgLocations.reduce((sum, pg) => sum + pg.beds_count, 0);
    const employeesCount = pgLocations.reduce((sum, pg) => sum + pg.employees_count, 0);
    const tenantsCount = pgLocations.reduce((sum, pg) => sum + pg.tenants_count, 0);

    return ResponseUtil.success(
      {
        s_no: org.s_no,
        name: org.name,
        description: org.description,
        status: org.status,
        is_deleted: org.is_deleted,
        superadmin_id: org.superadmin_id,
        created_at: org.created_at,
        updated_at: org.updated_at,
        pg_locations_count: pgLocations.length,
        rooms_count: roomsCount,
        beds_count: bedsCount,
        employees_count: employeesCount,
        tenants_count: tenantsCount,
        pg_locations: pgLocations,
      },
      'Organization fetched successfully',
    );
  }

  async reactivateOrganization(organizationId: number) {
    const org = await this.consumerPrisma.organization.findUnique({
      where: { s_no: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!org.is_deleted && org.status === 'ACTIVE') {
      return ResponseUtil.success(null, 'Organization is already active');
    }

    await this.consumerPrisma.$transaction([
      this.consumerPrisma.organization.update({
        where: { s_no: organizationId },
        data: {
          is_deleted: false,
          status: 'ACTIVE',
          deleted_at: null,
          deleted_by: null,
        },
      }),

      // Reactivate the super admin if it exists
      ...(org.superadmin_id
        ? [
            this.consumerPrisma.users.update({
              where: { s_no: org.superadmin_id },
              data: {
                is_deleted: false,
                status: 'ACTIVE',
              },
            }),
          ]
        : []),
    ]);

    return ResponseUtil.success(
      {
        s_no: org.s_no,
        name: org.name,
        status: 'ACTIVE',
        is_deleted: false,
        superadmin_id: org.superadmin_id,
      },
      'Organization and super admin reactivated successfully',
    );
  }

  async deleteOrganization(organizationId: number, adminUserId: number, reason?: string) {
    const org = await this.consumerPrisma.organization.findUnique({
      where: { s_no: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.is_deleted) {
      return ResponseUtil.success(null, 'Organization is already deleted');
    }

    const now = new Date();

    const orgUsers = await this.consumerPrisma.users.findMany({
      where: { organization_id: organizationId },
      select: { s_no: true },
    });
    const orgUserIds = orgUsers.map((u) => u.s_no);

    await this.consumerPrisma.$transaction([
      this.consumerPrisma.organization.update({
        where: { s_no: organizationId },
        data: {
          is_deleted: true,
          status: 'INACTIVE',
          deleted_at: now,
          deleted_by: adminUserId,
        },
      }),

      ...(org.superadmin_id
        ? [
            this.consumerPrisma.users.update({
              where: { s_no: org.superadmin_id },
              data: {
                is_deleted: true,
                status: 'INACTIVE',
              },
            }),
          ]
        : []),

      this.consumerPrisma.tokens.updateMany({
        where: {
          user_id: { in: orgUserIds },
          is_revoked: false,
        },
        data: {
          is_revoked: true,
          revoked_at: now,
        },
      }),
    ]);

    return ResponseUtil.success(
      {
        s_no: org.s_no,
        name: org.name,
        status: 'INACTIVE',
        is_deleted: true,
        superadmin_id: org.superadmin_id,
        reason: reason || 'Admin-initiated deletion',
      },
      'Organization and super admin deleted successfully',
    );
  }

  async getPgDetails(orgId: number, pgId: number) {
    const pg = await this.consumerPrisma.pg_locations.findFirst({
      where: {
        s_no: pgId,
        organization_id: orgId,
        is_deleted: false,
      },
      select: {
        s_no: true,
        location_name: true,
        address: true,
        pincode: true,
        status: true,
        pg_type: true,
        rent_cycle_type: true,
        rent_cycle_start: true,
        rent_cycle_end: true,
        created_at: true,
        updated_at: true,
        organization: {
          select: {
            s_no: true,
            name: true,
          },
        },
      },
    });

    if (!pg) {
      throw new NotFoundException('PG location not found');
    }

    const [rooms, tenants, employees] = await Promise.all([
      this.consumerPrisma.rooms.findMany({
        where: { pg_id: pgId, is_deleted: false },
        select: {
          s_no: true,
          room_no: true,
          created_at: true,
          updated_at: true,
          beds: {
            where: { is_deleted: false },
            select: {
              s_no: true,
              bed_no: true,
              bed_price: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
        orderBy: { s_no: 'asc' },
      }),
      this.consumerPrisma.tenants.findMany({
        where: { pg_id: pgId, is_deleted: false },
        select: {
          s_no: true,
          tenant_id: true,
          name: true,
          phone_no: true,
          email: true,
          status: true,
          check_in_date: true,
          check_out_date: true,
          room_id: true,
          bed_id: true,
          rooms: {
            select: { room_no: true },
          },
          beds: {
            select: { bed_no: true },
          },
        },
        orderBy: { s_no: 'desc' },
      }),
      this.consumerPrisma.pg_users.findMany({
        where: { pg_id: pgId, is_active: true },
        select: {
          s_no: true,
          monthly_salary_amount: true,
          created_at: true,
          users: {
            select: {
              s_no: true,
              name: true,
              email: true,
              phone: true,
              status: true,
            },
          },
        },
        orderBy: { s_no: 'asc' },
      }),
    ]);

    const roomsWithCounts = rooms.map((room) => ({
      s_no: room.s_no,
      room_no: room.room_no,
      beds_count: room.beds.length,
      beds: room.beds,
      created_at: room.created_at,
      updated_at: room.updated_at,
    }));

    const allBeds = rooms.flatMap((room) =>
      room.beds.map((bed) => ({
        ...bed,
        room_no: room.room_no,
        room_id: room.s_no,
      })),
    );

    const employeesList = employees.map((e) => ({
      s_no: e.s_no,
      user_id: e.users.s_no,
      name: e.users.name,
      email: e.users.email,
      phone: e.users.phone,
      status: e.users.status,
      monthly_salary_amount: e.monthly_salary_amount,
      created_at: e.created_at,
    }));

    return ResponseUtil.success(
      {
        ...pg,
        rooms_count: rooms.length,
        beds_count: allBeds.length,
        tenants_count: tenants.length,
        employees_count: employees.length,
        rooms: roomsWithCounts,
        beds: allBeds,
        tenants,
        employees: employeesList,
      },
      'PG details fetched successfully',
    );
  }
}
