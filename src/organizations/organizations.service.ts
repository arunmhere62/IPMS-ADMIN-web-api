import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';

interface ListOrganizationsParams {
  page: number;
  limit: number;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  async listOrganizations(params: ListOrganizationsParams) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const whereOrganizations: any = {
      is_deleted: false,
    };

    const [total, organizations] = await Promise.all([
      this.consumerPrisma.organization.count({ where: whereOrganizations }),
      this.consumerPrisma.organization.findMany({
        where: whereOrganizations,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          s_no: true,
          name: true,
          description: true,
          status: true,
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
        ? this.consumerPrisma.$queryRawUnsafe<
            Array<{ pg_id: number | null; _count: number }>
          >(
            `SELECT pg_id, COUNT(*) as _count FROM users WHERE is_deleted = 0 AND pg_id IN (${pgIds.join(',')}) GROUP BY pg_id`
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
      pgIds.length
        ? this.consumerPrisma.$queryRawUnsafe<
            Array<{ pg_id: number | null; _count: number }>
          >(
            `SELECT pg_id, COUNT(*) as _count FROM tenants WHERE is_deleted = 0 AND pg_id IN (${pgIds.join(',')}) GROUP BY pg_id`
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
    ]);

    const employeesByPgId = new Map<number, number>();
    for (const row of employeesGrouped) {
      if (row.pg_id != null) {
        employeesByPgId.set(row.pg_id, row._count ?? 0);
      }
    }

    const tenantsByPgId = new Map<number, number>();
    for (const row of tenantsGrouped) {
      if (row.pg_id != null) {
        tenantsByPgId.set(row.pg_id, row._count ?? 0);
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
    const org = await this.consumerPrisma.organization.findFirst({
      where: {
        s_no: organizationId,
        is_deleted: false,
      },
      select: {
        s_no: true,
        name: true,
        description: true,
        status: true,
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
        ? this.consumerPrisma.$queryRawUnsafe<
            Array<{ pg_id: number | null; _count: number }>
          >(
            `SELECT pg_id, COUNT(*) as _count FROM users WHERE is_deleted = 0 AND pg_id IN (${pgIds.join(',')}) GROUP BY pg_id`
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
      pgIds.length
        ? this.consumerPrisma.$queryRawUnsafe<
            Array<{ pg_id: number | null; _count: number }>
          >(
            `SELECT pg_id, COUNT(*) as _count FROM tenants WHERE is_deleted = 0 AND pg_id IN (${pgIds.join(',')}) GROUP BY pg_id`
          )
        : Promise.resolve([] as Array<{ pg_id: number | null; _count: number }>),
    ]);

    const employeesByPgId = new Map<number, number>();
    for (const row of employeesGrouped) {
      if (row.pg_id != null) {
        employeesByPgId.set(row.pg_id, row._count ?? 0);
      }
    }

    const tenantsByPgId = new Map<number, number>();
    for (const row of tenantsGrouped) {
      if (row.pg_id != null) {
        tenantsByPgId.set(row.pg_id, row._count ?? 0);
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
}
