import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';

@Injectable()
export class DirectoryListingsService {
  constructor(private readonly consumerPrisma: ConsumerPrismaService) {}

  /**
   * List all PG locations with their directory listing status
   * Supports filtering by published/unpublished and search
   */
  async listListings(params: {
    search?: string;
    cityId?: number;
    published?: boolean;
    featured?: boolean;
    page: number;
    limit: number;
  }) {
    const { search, cityId, published, featured, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      is_deleted: false,
    };

    if (search) {
      where.OR = [
        { location_name: { contains: search } },
        { address: { contains: search } },
      ];
    }

    if (cityId) {
      where.city_id = cityId;
    }

    // Filter by published status via the relation
    if (published !== undefined) {
      where.pg_directory_listings = {
        listing_published: published,
      };
    }

    if (featured !== undefined) {
      where.pg_directory_listings = {
        ...where.pg_directory_listings,
        is_featured: featured,
      };
    }

    const [items, total] = await Promise.all([
      this.consumerPrisma.pg_locations.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          s_no: true,
          location_name: true,
          address: true,
          pincode: true,
          pg_type: true,
          status: true,
          images: true,
          city_id: true,
          state_id: true,
          organization_id: true,
          created_at: true,
          city: { select: { s_no: true, name: true } },
          state: { select: { s_no: true, name: true } },
          organization: { select: { s_no: true, name: true } },
          pg_directory_listings: true,
        },
      }),
      this.consumerPrisma.pg_locations.count({ where }),
    ]);

    // Enrich with bed pricing + availability
    const pgIds = items.map((i) => i.s_no);
    const bedsData = await this.consumerPrisma.beds.groupBy({
      by: ['pg_id'],
      where: { pg_id: { in: pgIds }, is_deleted: false },
      _min: { bed_price: true },
      _count: true,
    });

    // Count available beds (not allocated to active tenants)
    const allocations = await this.consumerPrisma.tenant_allocations.findMany({
      where: {
        beds: { pg_id: { in: pgIds }, is_deleted: false },
        OR: [
          { effective_to: null },
          { effective_to: { gte: new Date() } },
        ],
      },
      select: { bed_id: true },
    });
    const allocatedBedIds = new Set(allocations.map((a) => a.bed_id));

    const allBeds = await this.consumerPrisma.beds.findMany({
      where: { pg_id: { in: pgIds }, is_deleted: false },
      select: { s_no: true, pg_id: true },
    });

    const priceMap = new Map<number, number>();
    const totalCountMap = new Map<number, number>();
    const availableCountMap = new Map<number, number>();

    for (const b of bedsData) {
      priceMap.set(b.pg_id, Number(b._min.bed_price ?? 0));
      totalCountMap.set(b.pg_id, b._count);
    }

    for (const b of allBeds) {
      if (!allocatedBedIds.has(b.s_no)) {
        availableCountMap.set(b.pg_id, (availableCountMap.get(b.pg_id) ?? 0) + 1);
      }
    }

    const enriched = items.map((item) => ({
      ...item,
      starting_price: priceMap.get(item.s_no) ?? null,
      available_beds: availableCountMap.get(item.s_no) ?? 0,
      total_beds: totalCountMap.get(item.s_no) ?? 0,
    }));

    return ResponseUtil.paginated(enriched, total, page, limit, 'Directory listings fetched');
  }

  /**
   * Get a single listing with full details
   */
  async getListing(pgId: number) {
    const pg = await this.consumerPrisma.pg_locations.findFirst({
      where: { s_no: pgId, is_deleted: false },
      select: {
        s_no: true,
        location_name: true,
        address: true,
        pincode: true,
        pg_type: true,
        status: true,
        images: true,
        city_id: true,
        state_id: true,
        organization_id: true,
        city: { select: { s_no: true, name: true } },
        state: { select: { s_no: true, name: true } },
        organization: { select: { s_no: true, name: true } },
        pg_directory_listings: true,
      },
    });

    if (!pg) {
      throw new NotFoundException(`PG with ID ${pgId} not found`);
    }

    return ResponseUtil.success(pg, 'Listing fetched successfully');
  }

  /**
   * Create or update a directory listing for a PG
   */
  async upsertListing(pgId: number, data: {
    listing_published?: boolean;
    listing_description?: string;
    listing_amenities?: any;
    listing_contact_phone?: string;
    listing_contact_email?: string;
    latitude?: number;
    longitude?: number;
    slug?: string;
    is_featured?: boolean;
    seo_title?: string;
    seo_description?: string;
  }) {
    // Verify PG exists
    const pg = await this.consumerPrisma.pg_locations.findFirst({
      where: { s_no: pgId, is_deleted: false },
    });

    if (!pg) {
      throw new NotFoundException(`PG with ID ${pgId} not found`);
    }

    // Auto-generate slug if not provided
    let slug = data.slug;
    if (!slug) {
      const existing = await this.consumerPrisma.pg_directory_listings.findUnique({
        where: { pg_id: pgId },
      });
      slug = existing?.slug || this.generateSlug(pg.location_name, pgId);
    }

    // Set published_at if publishing for the first time
    const existing = await this.consumerPrisma.pg_directory_listings.findUnique({
      where: { pg_id: pgId },
    });

    const updateData: any = { ...data, slug };
    if (data.listing_published && !existing?.published_at) {
      updateData.published_at = new Date();
    }

    const listing = await this.consumerPrisma.pg_directory_listings.upsert({
      where: { pg_id: pgId },
      create: {
        pg_id: pgId,
        ...updateData,
        published_at: data.listing_published ? new Date() : null,
      },
      update: updateData,
    });

    const message = data.listing_published
      ? 'PG published to directory successfully'
      : 'Listing updated successfully';

    return ResponseUtil.success(listing, message);
  }

  /**
   * Bulk publish/unpublish PGs
   */
  async bulkUpdate(pgIds: number[], data: {
    listing_published?: boolean;
    is_featured?: boolean;
  }) {
    // Create listings for PGs that don't have one yet
    for (const pgId of pgIds) {
      const pg = await this.consumerPrisma.pg_locations.findFirst({
        where: { s_no: pgId, is_deleted: false },
      });
      if (!pg) continue;

      const existing = await this.consumerPrisma.pg_directory_listings.findUnique({
        where: { pg_id: pgId },
      });

      if (!existing) {
        await this.consumerPrisma.pg_directory_listings.create({
          data: {
            pg_id: pgId,
            slug: this.generateSlug(pg.location_name, pgId),
            listing_published: data.listing_published ?? false,
            is_featured: data.is_featured ?? false,
            published_at: data.listing_published ? new Date() : null,
          },
        });
      } else {
        const updateData: any = { ...data };
        if (data.listing_published && !existing.published_at) {
          updateData.published_at = new Date();
        }
        await this.consumerPrisma.pg_directory_listings.update({
          where: { pg_id: pgId },
          data: updateData,
        });
      }
    }

    return ResponseUtil.success(
      { updated: pgIds.length },
      `Updated ${pgIds.length} PG listing(s)`,
    );
  }

  /**
   * Delete a directory listing (unpublish + remove)
   */
  async deleteListing(pgId: number) {
    const existing = await this.consumerPrisma.pg_directory_listings.findUnique({
      where: { pg_id: pgId },
    });

    if (!existing) {
      throw new NotFoundException(`Listing for PG ${pgId} not found`);
    }

    await this.consumerPrisma.pg_directory_listings.delete({
      where: { pg_id: pgId },
    });

    return ResponseUtil.success(null, 'Directory listing deleted');
  }

  /**
   * Get directory stats (for dashboard)
   */
  async getStats() {
    const [totalPgs, published, featured, totalViews] = await Promise.all([
      this.consumerPrisma.pg_locations.count({
        where: { is_deleted: false, status: 'ACTIVE' },
      }),
      this.consumerPrisma.pg_directory_listings.count({
        where: { listing_published: true },
      }),
      this.consumerPrisma.pg_directory_listings.count({
        where: { is_featured: true, listing_published: true },
      }),
      this.consumerPrisma.pg_directory_listings.aggregate({
        _sum: { view_count: true },
      }),
    ]);

    return ResponseUtil.success(
      {
        total_pgs: totalPgs,
        published: published,
        unpublished: totalPgs - published,
        featured,
        total_views: Number(totalViews._sum.view_count ?? 0),
      },
      'Directory stats fetched',
    );
  }

  private generateSlug(name: string, id: number): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return `${slug}-${id}`;
  }
}
