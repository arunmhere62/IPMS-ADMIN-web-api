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
  shortFormattedAddress?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string; languageCode: string };
  businessStatus?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
    languageCode: string;
  }>;
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
  google_rating_count: number | null;
  website: string | null;
  place_types: string[];
  primary_type: string | null;
  business_status: string | null;
  latitude: number | null;
  longitude: number | null;
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
  'places.shortFormattedAddress',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.types',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.location',
  'places.addressComponents',
  'nextPageToken',
].join(',');

const MAX_PAGES = 8; // Google allows up to 8 pages × 20 = 160 results per query
const PAGE_SIZE = 20;

// ─── Cost Control Limits ─────────────────────────────────────────────────────

const MAX_QUERY_LENGTH = 200;
const MIN_QUERY_LENGTH = 3;
const MAX_KEYWORDS_PER_SWEEP = 20;
const MAX_LEADS_PER_IMPORT = 500;
const MAX_AREA_LENGTH = 150;
// Daily API call budget — configurable via env. Default: 1000 calls/day
// At 8 calls/search, that's ~125 searches/day — plenty for normal usage
const DAILY_API_BUDGET = Number(process.env.GOOGLE_PLACES_DAILY_LIMIT || '1000');

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GoogleLeadsService {
  private readonly logger = new Logger('GoogleLeadsService');

  constructor(
    private readonly prisma: ManagementPrismaService,
    private readonly consumerPrisma: ConsumerPrismaService,
  ) {}

  /**
   * Check if the daily Google API call budget has been exceeded.
   * Counts all API calls made today from the search cache table.
   */
  private async checkDailyApiBudget(callsRequested: number): Promise<void> {
    if (DAILY_API_BUDGET <= 0) return; // 0 = unlimited

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayStats = await this.prisma.crm_google_search_cache.aggregate({
      where: { created_at: { gte: startOfDay } },
      _sum: { api_calls: true },
    });

    const usedToday = todayStats._sum.api_calls ?? 0;
    if (usedToday + callsRequested > DAILY_API_BUDGET) {
      throw new BadRequestException(
        `Daily Google API call budget exceeded. Used ${usedToday}/${DAILY_API_BUDGET} calls today. ` +
        `This request needs ${callsRequested} more. Try again tomorrow or ask admin to increase GOOGLE_PLACES_DAILY_LIMIT.`,
      );
    }
  }

  private getApiKey(): string {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new BadRequestException('GOOGLE_MAPS_API_KEY is not configured on the server');
    }
    return key;
  }

  /**
   * Quick check if a query+maxPages combo is already cached.
   * Used to skip the daily budget check for cache hits.
   */
  private async isQueryCached(query: string, maxPages: number): Promise<boolean> {
    const cached = await this.prisma.crm_google_search_cache.findFirst({
      where: { query, max_pages: maxPages },
      select: { s_no: true },
    });
    return !!cached;
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
    // ─── Validate query ───
    const query = textQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      throw new BadRequestException(`Search query must be at least ${MIN_QUERY_LENGTH} characters`);
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(`Search query must be at most ${MAX_QUERY_LENGTH} characters`);
    }

    const pagesToFetch = Math.min(maxPages, MAX_PAGES);

    // ─── Check daily API budget (only for fresh searches, not cache hits) ───
    if (forceRefresh || !(await this.isQueryCached(query, pagesToFetch))) {
      await this.checkDailyApiBudget(pagesToFetch);
    }

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
        google_rating_count: place.userRatingCount ?? null,
        website: place.websiteUri ?? null,
        place_types: place.types ?? [],
        primary_type: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
        business_status: place.businessStatus ?? null,
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
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
    const trimmedArea = area?.trim() ?? '';
    if (!trimmedArea) {
      throw new BadRequestException('Area is required');
    }
    if (trimmedArea.length > MAX_AREA_LENGTH) {
      throw new BadRequestException(`Area name must be at most ${MAX_AREA_LENGTH} characters`);
    }

    const uniqueKeywords = [...new Set(keywords.map((k) => k?.trim() ?? '').filter(Boolean))];
    if (uniqueKeywords.length === 0) {
      throw new BadRequestException('At least one keyword is required');
    }
    if (uniqueKeywords.length > MAX_KEYWORDS_PER_SWEEP) {
      throw new BadRequestException(
        `Too many keywords: ${uniqueKeywords.length}. Maximum ${MAX_KEYWORDS_PER_SWEEP} keywords per sweep to control API costs.`,
      );
    }

    const pages = Math.min(Math.max(maxPages, 1), MAX_PAGES);
    const queries = uniqueKeywords.map((kw) => `${kw} ${trimmedArea}`);

    // Pre-check daily budget for the entire sweep (worst case: all fresh searches)
    // Cache hits won't count, but we check upfront to prevent partial sweeps
    const maxPossibleCalls = uniqueKeywords.length * pages;
    await this.checkDailyApiBudget(maxPossibleCalls);

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
   * Parse a Google formattedAddress to extract city, state, and area.
   * Google format: "PG Name, Street, Area, City, State PIN, India"
   * Returns resolved IDs from consumer DB.
   */
  private parseAddressForLocation(
    address: string,
    cityByName: Map<string, { s_no: number; name: string; state_code: string }>,
    stateByName: Map<string, { s_no: number; name: string; iso_code: string }>,
    stateByCode: Map<string, { s_no: number; name: string; iso_code: string }>,
  ): { cityId: number | null; stateId: number | null; area: string | null } {
    // Split by commas and clean up
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { cityId: null, stateId: null, area: null };

    let cityId: number | null = null;
    let stateId: number | null = null;
    let area: string | null = null;

    // Scan parts from the end (India, State+PIN, City, Area, ...)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const partLower = part.toLowerCase();

      // Skip "India"
      if (partLower === 'india' || partLower === 'in') continue;

      // Check if this part is a state (with optional PIN code)
      // Google format: "Tamil Nadu 600001" or "Tamil Nadu"
      const stateMatch = part.match(/^(.+?)\s*\d{6}$/);
      const stateName = stateMatch ? stateMatch[1].trim() : part;
      const stateLower = stateName.toLowerCase();

      if (!stateId) {
        const state = stateByName.get(stateLower) ?? stateByCode.get(stateLower);
        if (state) {
          stateId = state.s_no;
          continue;
        }
      }

      // Check if this part is a city
      if (!cityId) {
        const city = cityByName.get(partLower);
        if (city) {
          cityId = city.s_no;
          // Also resolve state from city's state_code if not already found
          if (!stateId) {
            const s = stateByCode.get(city.state_code.toLowerCase());
            if (s) stateId = s.s_no;
          }
          continue;
        }
      }

      // First non-city, non-state, non-country part from the end is likely the area
      if (!area && partLower !== 'india') {
        // Skip PIN-only parts
        if (!/^\d{6}$/.test(part)) {
          area = part;
        }
      }
    }

    return { cityId, stateId, area };
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
      place_types?: string[] | null;
      primary_type?: string | null;
      business_status?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      google_rating_count?: number | null;
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
    if (leads.length > MAX_LEADS_PER_IMPORT) {
      throw new BadRequestException(
        `Too many leads: ${leads.length}. Maximum ${MAX_LEADS_PER_IMPORT} leads per import. ` +
        `Please split into smaller batches.`,
      );
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

    // Pre-fetch all Indian states and cities from consumer DB for fast lookup
    const allStates = await this.consumerPrisma.state.findMany({
      where: { country_code: 'IN' },
      select: { s_no: true, name: true, iso_code: true },
    });
    const stateByName = new Map(allStates.map((s) => [s.name.toLowerCase(), s]));
    const stateByCode = new Map(allStates.map((s) => [s.iso_code.toLowerCase(), s]));

    const allCities = await this.consumerPrisma.city.findMany({
      where: { country_code: 'IN' },
      select: { s_no: true, name: true, state_code: true },
    });
    const cityByName = new Map(allCities.map((c) => [c.name.toLowerCase(), c]));

    // India country
    const indiaCountry = await this.consumerPrisma.country.findFirst({
      where: { iso_code: 'IN' },
      select: { s_no: true },
    });
    const indiaCountryId = indiaCountry?.s_no ?? null;

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

        // Parse city/state from address (Google formattedAddress ends with "City, State PIN, India")
        let resolvedCityId: number | null = null;
        let resolvedStateId: number | null = null;
        let resolvedArea: string | null = null;

        if (lead.address) {
          const parsed = this.parseAddressForLocation(lead.address, cityByName, stateByName, stateByCode);
          resolvedCityId = parsed.cityId;
          resolvedStateId = parsed.stateId;
          resolvedArea = parsed.area;
        }

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
            city_id: resolvedCityId,
            state_id: resolvedStateId,
            country_id: indiaCountryId,
            area: resolvedArea,
            place_types: lead.place_types?.length ? lead.place_types.join(',') : null,
            primary_type: lead.primary_type ?? null,
            business_status: lead.business_status ?? null,
            latitude: lead.latitude ?? null,
            longitude: lead.longitude ?? null,
            google_rating_count: lead.google_rating_count ?? null,
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
