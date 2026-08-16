import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DirectoryListingsService } from './directory-listings.service';

@ApiTags('directory-listings')
@Controller('directory-listings')
export class DirectoryListingsController {
  constructor(private readonly service: DirectoryListingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all PGs with their directory listing status' })
  async listListings(
    @Query('search') search?: string,
    @Query('cityId') cityId?: string,
    @Query('published') published?: string,
    @Query('featured') featured?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listListings({
      search,
      cityId: cityId ? Number(cityId) : undefined,
      published: published === 'true' ? true : published === 'false' ? false : undefined,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 20, 100),
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get directory listing statistics' })
  async getStats() {
    return this.service.getStats();
  }

  @Get(':pgId')
  @ApiOperation({ summary: 'Get a single PG listing with details' })
  async getListing(@Param('pgId', ParseIntPipe) pgId: number) {
    return this.service.getListing(pgId);
  }

  @Put(':pgId')
  @ApiOperation({ summary: 'Create or update a directory listing for a PG' })
  async upsertListing(
    @Param('pgId', ParseIntPipe) pgId: number,
    @Body() body: {
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
    },
  ) {
    return this.service.upsertListing(pgId, body);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk publish/unpublish/feature multiple PGs' })
  async bulkUpdate(
    @Body() body: {
      pgIds: number[];
      listing_published?: boolean;
      is_featured?: boolean;
    },
  ) {
    return this.service.bulkUpdate(body.pgIds, {
      listing_published: body.listing_published,
      is_featured: body.is_featured,
    });
  }

  @Patch(':pgId/toggle-publish')
  @ApiOperation({ summary: 'Quick toggle publish status for a PG' })
  async togglePublish(@Param('pgId', ParseIntPipe) pgId: number) {
    const listing = await this.service.getListing(pgId);
    const current = (listing as any)?.data?.pg_directory_listings?.listing_published ?? false;
    return this.service.upsertListing(pgId, { listing_published: !current });
  }

  @Delete(':pgId')
  @ApiOperation({ summary: 'Delete a directory listing' })
  async deleteListing(@Param('pgId', ParseIntPipe) pgId: number) {
    return this.service.deleteListing(pgId);
  }
}
