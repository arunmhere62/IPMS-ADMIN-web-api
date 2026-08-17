import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { toE164 } from '../common/utils/phone.util';
import { searchByCity } from '@twin.techies/india-pincode';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GooglePlace {
  id: string;
  displayName?: { text: string; languageCode: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  websiteUri?: string;
  types?: string[];
}

interface TextSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

export interface GoogleLeadResult {
  google_place_id: string;
  pg_name: string;
  phone: string | null;
  international_phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  google_rating: number | null;
  website: string | null;
  place_types: string[];
  already_imported: boolean;
  existing_contact_id: number | null;
  duplicate_reason: string | null;
  duplicate_of_pg_name: string | null;
}

export interface SearchGoogleLeadsResult {
  query: string;
  results: GoogleLeadResult[];
  total: number;
  new_count: number;
  already_imported_count: number;
  duplicate_count: number;
  with_phone_count: number;
  next_page_token: string | null;
  api_calls_made: number;
  from_cache?: boolean;
  cached_at?: Date;
  phone_only?: boolean;
}

export interface ImportGoogleLeadsResult {
  imported: number;
  skipped_duplicates: number;
  skipped_no_phone: number;
  failed: number;
  errors: string[];
  imported_contacts: Array<{ s_no: number; pg_name: string; phone: string | null }>;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.websiteUri',
  'places.types',
  'nextPageToken',
].join(',');

const MAX_PAGES = 8; // Google allows up to 8 pages × 20 = 160 results per query
const PAGE_SIZE = 20;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GoogleLeadsService {
  private readonly logger = new Logger('GoogleLeadsService');

  constructor(
    private readonly prisma: ManagementPrismaService,
    private readonly consumerPrisma: ConsumerPrismaService,
  ) {}

  private getApiKey(): string {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new BadRequestException('GOOGLE_MAPS_API_KEY is not configured on the server');
    }
    return key;
  }

  /**
   * Search Google Places API (New) for PG/hostel businesses.
   * Uses cache: if the same query+maxPages was searched before, returns cached results (zero API cost).
   * Pass forceRefresh=true to bypass cache and make fresh API calls.
   */
  async searchGoogleLeads(
    textQuery: string,
    maxPages: number = 1,
    forceRefresh: boolean = false,
    searchedBy?: number,
    phoneOnly: boolean = false,
  ): Promise<SearchGoogleLeadsResult> {
    const pagesToFetch = Math.min(maxPages, MAX_PAGES);

    // ─── Check cache first ───
    if (!forceRefresh) {
      const cached = await this.prisma.crm_google_search_cache.findFirst({
        where: { query: textQuery, max_pages: pagesToFetch },
        orderBy: { created_at: 'desc' },
      });
      if (cached) {
        const cachedResults = JSON.parse(cached.results_json) as SearchGoogleLeadsResult;
        // Re-check which ones are now imported (DB may have changed since cache)
        const placeIds = cachedResults.results.map((r) => r.google_place_id);
        const phones = cachedResults.results.map((r) => r.phone).filter(Boolean) as string[];
        const orConds: any[] = [];
        if (placeIds.length) orConds.push({ google_place_id: { in: placeIds } });
        if (phones.length) orConds.push({ phone: { in: phones } });
        const nowExisting = orConds.length
          ? await this.prisma.crm_contacts.findMany({
              where: { OR: orConds, is_deleted: false },
              select: { s_no: true, google_place_id: true, phone: true, pg_name: true },
            })
          : [];
        const existByPid = new Map(nowExisting.filter((c) => c.google_place_id).map((c) => [c.google_place_id, c]));
        const existByPhone = new Map(nowExisting.filter((c) => c.phone).map((c) => [c.phone, c]));

        for (const r of cachedResults.results) {
          const byPid = existByPid.get(r.google_place_id);
          const byPh = r.phone ? existByPhone.get(r.phone) : null;
          const isImported = !!byPid || !!byPh;
          r.already_imported = isImported;
          r.existing_contact_id = byPid?.s_no ?? byPh?.s_no ?? null;
          r.duplicate_reason = isImported
            ? byPid ? 'Already imported (Place ID match)' : `Phone ${r.phone} already in DB`
            : null;
          r.duplicate_of_pg_name = isImported ? (byPid ?? byPh)?.pg_name ?? null : null;
        }

        const newCount = cachedResults.results.filter((r) => !r.already_imported).length;
        const dupCount = cachedResults.results.length - newCount;
        cachedResults.new_count = newCount;
        cachedResults.already_imported_count = dupCount;
        cachedResults.duplicate_count = dupCount;
        cachedResults.api_calls_made = 0; // From cache, no API calls
        cachedResults.from_cache = true;
        cachedResults.cached_at = cached.created_at;
        return cachedResults;
      }
    }

    // ─── Fresh API search ───
    const apiKey = this.getApiKey();
    const allPlaces: GooglePlace[] = [];
    let nextPageToken: string | null = null;
    let apiCallsMade = 0;

    // Page 1: initial search
    for (let page = 0; page < pagesToFetch; page++) {
      const requestBody: any = {
        textQuery: page === 0 ? textQuery : `${textQuery}`,
        pageSize: PAGE_SIZE,
      };
      if (nextPageToken) {
        requestBody.pageToken = nextPageToken;
      }

      try {
        this.logger.log(`Google Places API call ${page + 1}/${pagesToFetch} for query: "${textQuery}"`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(PLACES_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        apiCallsMade++;
        const data = await res.json() as TextSearchResponse;

        if (!res.ok) {
          const msg = (data as any)?.error?.message ?? 'Unknown Google API error';
          this.logger.error(`Google API error (${res.status}): ${msg}`);
          throw new InternalServerErrorException(`Google API error (${res.status}): ${msg}`);
        }

        const places = data.places ?? [];
        allPlaces.push(...places);
        nextPageToken = data.nextPageToken ?? null;

        if (!nextPageToken || places.length === 0) break;

        // Google requires a short delay before using nextPageToken
        if (nextPageToken && page < pagesToFetch - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        if (error instanceof InternalServerErrorException) throw error;
        throw new InternalServerErrorException(`Failed to call Google Places API: ${error.message}`);
      }
    }

    // ─── Dedup Step 1: Remove exact same place ID within this batch ───
    const seenPlaceIds = new Set<string>();
    const uniquePlaces = allPlaces.filter((p) => {
      if (!p.id || seenPlaceIds.has(p.id)) return false;
      seenPlaceIds.add(p.id);
      return true;
    });

    // ─── Dedup Step 2: Check against DB by google_place_id AND phone ───
    const placeIds = uniquePlaces.map((p) => p.id);
    const phonesInBatch = uniquePlaces
      .map((p) => toE164(p.nationalPhoneNumber || p.internationalPhoneNumber))
      .filter((p): p is string => !!p);

    const orConditions: any[] = [];
    if (placeIds.length) orConditions.push({ google_place_id: { in: placeIds } });
    if (phonesInBatch.length) orConditions.push({ phone: { in: phonesInBatch } });

    const existingContacts = orConditions.length
      ? await this.prisma.crm_contacts.findMany({
          where: { OR: orConditions, is_deleted: false },
          select: { s_no: true, google_place_id: true, phone: true, pg_name: true },
        })
      : [];

    const existingByPlaceId = new Map(existingContacts.filter((c) => c.google_place_id).map((c) => [c.google_place_id, c]));
    const existingByPhone = new Map(existingContacts.filter((c) => c.phone).map((c) => [c.phone, c]));

    // ─── Dedup Step 3: Within-batch phone dedup (same phone, different place ID) ───
    const batchPhoneSeen = new Map<string, string>(); // phone -> pg_name of first occurrence

    // Build results
    const results: GoogleLeadResult[] = uniquePlaces.map((place) => {
      const phone = place.nationalPhoneNumber || null;
      const normalizedPhone = phone ? toE164(phone) : null;
      const intlPhone = place.internationalPhoneNumber || null;
      const pgName = place.displayName?.text ?? '(Unknown)';

      let alreadyImported = false;
      let existingContactId: number | null = null;
      let duplicateReason: string | null = null;
      let duplicateOfPgName: string | null = null;

      // Check DB by place_id
      const existingByPid = existingByPlaceId.get(place.id);
      if (existingByPid) {
        alreadyImported = true;
        existingContactId = existingByPid.s_no;
        duplicateReason = `Already imported (Place ID match)`;
        duplicateOfPgName = existingByPid.pg_name;
      }

      // Check DB by phone
      if (!alreadyImported && normalizedPhone) {
        const existingByPh = existingByPhone.get(normalizedPhone);
        if (existingByPh) {
          alreadyImported = true;
          existingContactId = existingByPh.s_no;
          duplicateReason = `Phone ${normalizedPhone} already in DB`;
          duplicateOfPgName = existingByPh.pg_name;
        }
      }

      // Check within-batch phone dedup
      if (!alreadyImported && normalizedPhone) {
        if (batchPhoneSeen.has(normalizedPhone)) {
          alreadyImported = true;
          duplicateReason = `Duplicate phone within this search`;
          duplicateOfPgName = batchPhoneSeen.get(normalizedPhone)!;
        } else {
          batchPhoneSeen.set(normalizedPhone, pgName);
        }
      }

      return {
        google_place_id: place.id,
        pg_name: pgName,
        phone: normalizedPhone,
        international_phone: intlPhone ?? null,
        address: place.formattedAddress ?? null,
        google_maps_url: place.googleMapsUri ?? null,
        google_rating: place.rating ?? null,
        website: place.websiteUri ?? null,
        place_types: place.types ?? [],
        already_imported: alreadyImported,
        existing_contact_id: existingContactId,
        duplicate_reason: duplicateReason,
        duplicate_of_pg_name: duplicateOfPgName,
      };
    });

    // Filter out results without phone if phoneOnly is requested
    const finalResults = phoneOnly ? results.filter((r) => r.phone) : results;

    const newCount = finalResults.filter((r) => !r.already_imported).length;
    const dupCount = finalResults.filter((r) => r.already_imported).length;
    const withPhoneCount = finalResults.filter((r) => r.phone).length;

    const searchResult: SearchGoogleLeadsResult = {
      query: textQuery,
      results: finalResults,
      total: finalResults.length,
      new_count: newCount,
      already_imported_count: dupCount,
      duplicate_count: dupCount,
      with_phone_count: withPhoneCount,
      next_page_token: nextPageToken,
      api_calls_made: apiCallsMade,
      from_cache: false,
      phone_only: phoneOnly,
    };

    // ─── Save to cache ───
    try {
      await this.prisma.crm_google_search_cache.create({
        data: {
          query: textQuery,
          max_pages: pagesToFetch,
          total: results.length,
          new_count: newCount,
          api_calls: apiCallsMade,
          results_json: JSON.stringify(searchResult),
          searched_by: searchedBy ?? null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Failed to cache search results: ${e.message}`);
    }

    return searchResult;
  }

  /**
   * Sweep an area with multiple keywords and merge/dedup the results.
   * Runs each keyword+area query in parallel and returns a combined result set.
   */
  async sweepGoogleLeads(
    area: string,
    keywords: string[],
    maxPages: number = 1,
    phoneOnly: boolean = false,
    searchedBy?: number,
  ): Promise<SearchGoogleLeadsResult> {
    const uniqueKeywords = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
    if (!area?.trim() || uniqueKeywords.length === 0) {
      throw new BadRequestException('Area and at least one keyword are required');
    }

    const pages = Math.min(Math.max(maxPages, 1), MAX_PAGES);
    const queries = uniqueKeywords.map((kw) => `${kw} ${area.trim()}`);

    const perQuery = await Promise.all(
      queries.map((q) => this.searchGoogleLeads(q, pages, false, searchedBy, phoneOnly)),
    );

    const seenPlaceIds = new Set<string>();
    const seenPhones = new Set<string>();
    const merged: GoogleLeadResult[] = [];
    let totalApiCalls = 0;

    for (const result of perQuery) {
      totalApiCalls += result.api_calls_made;
      for (const lead of result.results) {
        const hasPlaceId = lead.google_place_id && seenPlaceIds.has(lead.google_place_id);
        const hasPhone = lead.phone && seenPhones.has(lead.phone);
        if (hasPlaceId || hasPhone) continue;

        if (lead.google_place_id) seenPlaceIds.add(lead.google_place_id);
        if (lead.phone) seenPhones.add(lead.phone);
        merged.push(lead);
      }
    }

    const total = merged.length;
    const newCount = merged.filter((r) => !r.already_imported).length;
    const dupCount = merged.filter((r) => r.already_imported).length;
    const withPhoneCount = merged.filter((r) => r.phone).length;

    return {
      query: `Sweep: ${uniqueKeywords.length} keywords in ${area.trim()}`,
      results: merged,
      total,
      new_count: newCount,
      already_imported_count: dupCount,
      duplicate_count: dupCount,
      with_phone_count: withPhoneCount,
      next_page_token: null,
      api_calls_made: totalApiCalls,
      from_cache: false,
      phone_only: phoneOnly,
    };
  }

  /**
   * Import selected Google Places results into crm_contacts.
   * Deduplicates by google_place_id and phone number.
   */
  async importGoogleLeads(
    leads: Array<{
      google_place_id: string;
      pg_name: string;
      phone?: string | null;
      address?: string | null;
      google_maps_url?: string | null;
      google_rating?: number | null;
      website?: string | null;
    }>,
    importedBy?: number,
  ): Promise<ImportGoogleLeadsResult> {
    const result: ImportGoogleLeadsResult = {
      imported: 0,
      skipped_duplicates: 0,
      skipped_no_phone: 0,
      failed: 0,
      errors: [],
      imported_contacts: [],
    };

    if (!leads.length) {
      return result;
    }

    // Create an import batch for tracking
    const batch = await this.prisma.crm_import_batches.create({
      data: {
        filename: `google-places-${new Date().toISOString().split('T')[0]}`,
        total_rows: leads.length,
        uploaded_by: importedBy ?? 1,
      },
    });

    // Pre-fetch existing contacts by google_place_id and phone
    const placeIds = leads.map((l) => l.google_place_id).filter(Boolean);
    const phones = leads.map((l) => toE164(l.phone)).filter((p): p is string => !!p);

    const orConditions: any[] = [];
    if (placeIds.length) orConditions.push({ google_place_id: { in: placeIds } });
    if (phones.length) orConditions.push({ phone: { in: phones } });

    const existing = orConditions.length
      ? await this.prisma.crm_contacts.findMany({
          where: { OR: orConditions, is_deleted: false },
          select: { s_no: true, google_place_id: true, phone: true },
        })
      : [];

    const existingPlaceIds = new Set(existing.map((c) => c.google_place_id).filter(Boolean));
    const existingPhones = new Set(existing.map((c) => c.phone).filter(Boolean));

    // Resolve Chennai city/state/country from consumer DB
    let chennaiCity: { city_id: number; state_id: number; country_id: number } | null = null;
    const city = await this.consumerPrisma.city.findFirst({
      where: { name: { equals: 'Chennai' } },
      select: { s_no: true, state_code: true, country_code: true },
    });
    if (city) {
      const state = await this.consumerPrisma.state.findFirst({
        where: { iso_code: city.state_code },
        select: { s_no: true },
      });
      const country = await this.consumerPrisma.country.findFirst({
        where: { iso_code: city.country_code },
        select: { s_no: true },
      });
      chennaiCity = {
        city_id: city.s_no,
        state_id: state?.s_no ?? null,
        country_id: country?.s_no ?? null,
      };
    }

    for (const lead of leads) {
      try {
        // Skip if already imported by place_id or phone
        if (lead.google_place_id && existingPlaceIds.has(lead.google_place_id)) {
          result.skipped_duplicates++;
          continue;
        }
        const normalizedPhone = toE164(lead.phone);
        if (normalizedPhone && existingPhones.has(normalizedPhone)) {
          result.skipped_duplicates++;
          continue;
        }

        // Add to existing sets to prevent within-batch duplicates
        if (lead.google_place_id) existingPlaceIds.add(lead.google_place_id);
        if (normalizedPhone) existingPhones.add(normalizedPhone);

        await this.prisma.crm_contacts.create({
          data: {
            pg_name: lead.pg_name.trim(),
            phone: normalizedPhone,
            google_place_id: lead.google_place_id,
            google_maps_url: lead.google_maps_url ?? null,
            google_rating: lead.google_rating ?? null,
            website: lead.website ?? null,
            address: lead.address ?? null,
            source: 'GOOGLE',
            status: 'NEW',
            import_batch_id: batch.s_no,
            city_id: chennaiCity?.city_id ?? null,
            state_id: chennaiCity?.state_id ?? null,
            country_id: chennaiCity?.country_id ?? null,
          },
        });

        result.imported++;
        result.imported_contacts.push({
          s_no: 0, // Will be filled by DB
          pg_name: lead.pg_name.trim(),
          phone: normalizedPhone,
        });
      } catch (err: any) {
        result.failed++;
        result.errors.push(`Failed to import "${lead.pg_name}": ${err.message}`);
      }
    }

    // Update batch record
    await this.prisma.crm_import_batches.update({
      where: { s_no: batch.s_no },
      data: {
        imported_count: result.imported,
        failed_count: result.failed + result.skipped_duplicates,
      },
    });

    return result;
  }

  // ─── Search Areas: uses existing consumer city table + crm_contacts.area ────

  /**
   * Returns cities from consumer DB + areas from india-pincode library + crm_contacts.
   * Uses @twin.techies/india-pincode for offline post office data (39k+ offices).
   */
  async listSearchAreas() {
    // 1. Get cities from consumer DB (where PGs exist)
    const cities = await this.consumerPrisma.city.findMany({
      where: {
        pg_locations: { some: { is_deleted: false } },
      },
      select: {
        s_no: true,
        name: true,
        state_code: true,
        country_code: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: 'asc' },
    });

    // 2. Get distinct area values from crm_contacts (areas we've already discovered)
    const contactAreas = await this.prisma.crm_contacts.findMany({
      where: {
        is_deleted: false,
        NOT: { area: null },
      },
      select: { area: true, city_id: true },
      distinct: ['area'],
      orderBy: { area: 'asc' },
    });

    // 3. Get areas from india-pincode library for each city (offline, instant)
    const pincodeCityMap = new Map<string, string[]>(); // city name -> areas
    for (const city of cities) {
      try {
        const offices = searchByCity(city.name, { limit: 500, fuzzy: false });
        const areaNames = offices
          .map((o) => o.name)
          .filter((n): n is string => !!n && n.trim().length > 0)
          .map((n) => n.trim());
        pincodeCityMap.set(city.name, [...new Set(areaNames)].sort());
      } catch {
        // City not found in pincode DB — skip
      }
    }

    // 4. Build response: cities with their areas (pincode + crm_contacts merged)
    const cityMap = new Map<number, { id: number; name: string; areas: string[] }>();
    for (const c of cities) {
      const pincodeAreas = pincodeCityMap.get(c.name) ?? [];
      cityMap.set(c.s_no, { id: c.s_no, name: c.name, areas: [...new Set(pincodeAreas)] });
    }

    // Attach contact areas to their city (merge with pincode areas)
    for (const ca of contactAreas) {
      if (ca.area && ca.area.trim()) {
        const cityEntry = cityMap.get(ca.city_id ?? 0);
        if (cityEntry && !cityEntry.areas.includes(ca.area.trim())) {
          cityEntry.areas.push(ca.area.trim());
        }
      }
    }

    // Sort areas within each city
    for (const city of cityMap.values()) {
      city.areas.sort();
    }

    // 5. Collect orphan areas (no city_id) as a separate group
    const orphanAreas = contactAreas
      .filter((ca) => !ca.city_id && ca.area?.trim())
      .map((ca) => ca.area!.trim());

    // 6. Get keywords from crm_search_keywords table
    const keywords = await this.listSearchKeywords();

    // Total areas = sum of all city areas + orphan areas
    const totalAreas = Array.from(cityMap.values()).reduce((sum, c) => sum + c.areas.length, 0) + new Set(orphanAreas).size;

    return {
      cities: Array.from(cityMap.values()),
      orphan_areas: [...new Set(orphanAreas)],
      total_cities: cities.length,
      total_areas: totalAreas,
      keywords,
    };
  }

  async listSearchAreasByCity(cityId: number) {
    const city = await this.consumerPrisma.city.findUnique({
      where: { s_no: cityId },
      select: { s_no: true, name: true },
    });
    if (!city) {
      throw new BadRequestException('City not found');
    }

    const names = new Set<string>();

    // 1. Post offices from india-pincode library for the city name
    try {
      const offices = searchByCity(city.name, { limit: 500, fuzzy: false });
      for (const o of offices) {
        if (o.name?.trim()) names.add(o.name.trim());
      }
    } catch {
      // City not in pincode DB — use existing data only
    }

    const areas = [...names].sort();
    return { city: { id: city.s_no, name: city.name }, areas };
  }

  async listSearchCities(stateCode?: string) {
    const where: any = {
      country_code: 'IN',
    };
    if (stateCode) {
      where.state_code = stateCode;
    }

    const cities = await this.consumerPrisma.city.findMany({
      where,
      select: {
        s_no: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      cities: cities.map((c) => ({ id: c.s_no, name: c.name })),
    };
  }

  async listSearchStates() {
    const states = await this.consumerPrisma.state.findMany({
      where: {
        country_code: 'IN',
      },
      select: {
        s_no: true,
        name: true,
        iso_code: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      states: states.map((s) => ({ id: s.s_no, name: s.name, code: s.iso_code })),
    };
  }

  // ─── Search Keywords Management ────────────────────────────────────────────

  async listSearchKeywords(): Promise<string[]> {
    const rows = await this.prisma.crm_search_keywords.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { keyword: 'asc' }],
      select: { keyword: true },
    });
    if (rows.length > 0) return rows.map((r) => r.keyword);
    // Fallback: return empty array, frontend will show empty state
    return [];
  }

  async createSearchKeyword(keyword: string, sortOrder?: number) {
    return this.prisma.crm_search_keywords.create({
      data: {
        keyword: keyword.trim(),
        sort_order: sortOrder ?? 0,
      },
    });
  }

  async updateSearchKeyword(id: number, data: { keyword?: string; is_active?: boolean; sort_order?: number }) {
    return this.prisma.crm_search_keywords.update({
      where: { s_no: id },
      data,
    });
  }

  async deleteSearchKeyword(id: number) {
    return this.prisma.crm_search_keywords.delete({ where: { s_no: id } });
  }

  async seedSearchKeywords(): Promise<{ created: number; skipped: number }> {
    const keywords = [
      'PG', 'Paying Guest', "Men's PG", "Gents PG", "Ladies PG", "Women's PG",
      "Men's Hostel", "Women's Hostel", "Working Men's Hostel", "Working Women's Hostel",
      'Boys Hostel', 'Girls Hostel', 'Student Hostel',
    ];

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < keywords.length; i++) {
      try {
        await this.prisma.crm_search_keywords.create({
          data: { keyword: keywords[i], sort_order: i },
        });
        created++;
      } catch (e: any) {
        skipped++;
      }
    }

    return { created, skipped };
  }
}
