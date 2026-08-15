import { Injectable, NotFoundException } from '@nestjs/common';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { toE164 } from '../common/utils/phone.util';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: ManagementPrismaService,
    private readonly consumerPrisma: ConsumerPrismaService,
  ) {}

  // CONTACTS
  private async enrichWithLocation<T extends { country_id?: number | null; state_id?: number | null; city_id?: number | null }>(
    items: T[]
  ): Promise<(T & { country?: { s_no: number; name: string } | null; state?: { s_no: number; name: string } | null; city?: { s_no: number; name: string } | null })[]> {
    const countryIds = new Set<number>();
    const stateIds = new Set<number>();
    const cityIds = new Set<number>();
    for (const item of items) {
      if (item.country_id) countryIds.add(item.country_id);
      if (item.state_id) stateIds.add(item.state_id);
      if (item.city_id) cityIds.add(item.city_id);
    }

    const [countries, states, cities] = await Promise.all([
      countryIds.size
        ? this.consumerPrisma.country.findMany({ where: { s_no: { in: [...countryIds] } }, select: { s_no: true, name: true } })
        : Promise.resolve([]),
      stateIds.size
        ? this.consumerPrisma.state.findMany({ where: { s_no: { in: [...stateIds] } }, select: { s_no: true, name: true } })
        : Promise.resolve([]),
      cityIds.size
        ? this.consumerPrisma.city.findMany({ where: { s_no: { in: [...cityIds] } }, select: { s_no: true, name: true } })
        : Promise.resolve([]),
    ]);

    const countryMap = new Map(countries.map((c) => [c.s_no, c]));
    const stateMap = new Map(states.map((s) => [s.s_no, s]));
    const cityMap = new Map(cities.map((c) => [c.s_no, c]));

    return items.map((item) => ({
      ...item,
      country: item.country_id ? countryMap.get(item.country_id) ?? null : null,
      state: item.state_id ? stateMap.get(item.state_id) ?? null : null,
      city: item.city_id ? cityMap.get(item.city_id) ?? null : null,
    }));
  }

  async listContacts(params: { page?: number; limit?: number; search?: string; city?: string; status?: string; source?: string; sortBy?: string; sortOrder?: string }): Promise<[any[], number]> {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { is_deleted: false };

    if (params.search) {
      const q = params.search.trim();
      // For phone searches: strip non-digits so "3789" matches "+919876543789"
      const digitsOnly = q.replace(/\D/g, '');
      const phoneConditions: any[] = [{ phone: { contains: q } }, { alternate_phone: { contains: q } }];
      if (digitsOnly && digitsOnly !== q) {
        phoneConditions.push({ phone: { contains: digitsOnly } });
        phoneConditions.push({ alternate_phone: { contains: digitsOnly } });
      }
      where.OR = [
        { pg_name: { contains: q } },
        { owner_name: { contains: q } },
        ...phoneConditions,
        { area: { contains: q } },
      ];
    }
    if (params.status) where.status = params.status as any;
    if (params.source) where.source = params.source as any;

    const allowedSortFields = ['s_no', 'pg_name', 'owner_name', 'phone', 'status', 'source', 'created_at', 'no_of_rooms', 'google_rating'];
    const sortBy = allowedSortFields.includes(params.sortBy ?? '') ? params.sortBy! : 'created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.crm_contacts.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.crm_contacts.count({ where }),
    ]);
    const enriched = await this.enrichWithLocation(rows);
    return [enriched, total];
  }

  /**
   * Enterprise-level duplicate check for bulk import preview.
   * Checks rows against DB (existing contacts) AND within the batch itself.
   * Returns per-row duplicate status with reason + matched existing contact info.
   */
  async checkDuplicates(rows: any[]): Promise<{
    total: number;
    duplicates: number;
    unique: number;
    rows: Array<{
      index: number;
      pg_name: string;
      phone: string | null;
      whatsapp_number: string | null;
      is_duplicate: boolean;
      duplicate_reason: string | null;
      matched_contact_id: number | null;
      matched_pg_name: string | null;
      matched_phone: string | null;
    }>;
  }> {
    const normalized = rows.map((r) => {
      const rawPhone = String(r.phone ?? '').trim();
      const phoneParts = rawPhone.split(/\s*[/,|&]\s*/).map((p) => toE164(p)).filter(Boolean);
      return {
        pg_name: (r.pg_name ?? '').toString().trim(),
        phone: phoneParts[0] ?? null,
        whatsapp_number: toE164(r.whatsapp_number) ?? null,
      };
    });

    const phones = normalized.map((r) => r.phone).filter(Boolean) as string[];
    const whatsapps = normalized.map((r) => r.whatsapp_number).filter(Boolean) as string[];
    const pgNames = normalized.map((r) => r.pg_name).filter(Boolean) as string[];

    const orConditions: any[] = [];
    if (phones.length) orConditions.push({ phone: { in: phones } });
    if (whatsapps.length) orConditions.push({ whatsapp_number: { in: whatsapps } });
    if (pgNames.length) orConditions.push({ pg_name: { in: pgNames } });

    const existing = orConditions.length
      ? await this.prisma.crm_contacts.findMany({
          where: { OR: orConditions, is_deleted: false },
          select: { s_no: true, pg_name: true, phone: true, whatsapp_number: true },
        })
      : [];

    const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [c.phone, c]));
    const byWhatsapp = new Map(existing.filter((c) => c.whatsapp_number).map((c) => [c.whatsapp_number, c]));
    const byPgName = new Map(existing.map((c) => [c.pg_name, c]));

    const seenPhones = new Set<string>();
    const seenWhatsapp = new Set<string>();
    const seenPgNames = new Set<string>();

    const result = normalized.map((r, i) => {
      let isDuplicate = false;
      let reason: string | null = null;
      let matched: { s_no: number; pg_name: string; phone: string | null } | null = null;

      if (r.phone && byPhone.has(r.phone)) {
        isDuplicate = true;
        reason = `Phone ${r.phone} already exists in DB`;
        matched = byPhone.get(r.phone)!;
      } else if (r.whatsapp_number && byWhatsapp.has(r.whatsapp_number)) {
        isDuplicate = true;
        reason = `WhatsApp ${r.whatsapp_number} already exists in DB`;
        matched = byWhatsapp.get(r.whatsapp_number)!;
      } else if (r.pg_name && byPgName.has(r.pg_name)) {
        isDuplicate = true;
        reason = `PG name "${r.pg_name}" already exists in DB`;
        matched = byPgName.get(r.pg_name)!;
      } else if (r.phone && seenPhones.has(r.phone)) {
        isDuplicate = true;
        reason = `Phone ${r.phone} duplicated within this batch`;
      } else if (r.whatsapp_number && seenWhatsapp.has(r.whatsapp_number)) {
        isDuplicate = true;
        reason = `WhatsApp ${r.whatsapp_number} duplicated within this batch`;
      } else if (r.pg_name && seenPgNames.has(r.pg_name)) {
        isDuplicate = true;
        reason = `PG name "${r.pg_name}" duplicated within this batch`;
      }

      if (r.phone) seenPhones.add(r.phone);
      if (r.whatsapp_number) seenWhatsapp.add(r.whatsapp_number);
      if (r.pg_name) seenPgNames.add(r.pg_name);

      return {
        index: i,
        pg_name: r.pg_name,
        phone: r.phone,
        whatsapp_number: r.whatsapp_number,
        is_duplicate: isDuplicate,
        duplicate_reason: reason,
        matched_contact_id: matched?.s_no ?? null,
        matched_pg_name: matched?.pg_name ?? null,
        matched_phone: matched?.phone ?? null,
      };
    });

    const duplicates = result.filter((r) => r.is_duplicate).length;
    return {
      total: result.length,
      duplicates,
      unique: result.length - duplicates,
      rows: result,
    };
  }

  async createContact(data: Parameters<typeof this.prisma.crm_contacts.create>[0]['data']) {
    const payload = { ...data } as any;
    if (payload.phone) payload.phone = toE164(payload.phone);
    if (payload.alternate_phone) payload.alternate_phone = toE164(payload.alternate_phone);
    if (payload.whatsapp_number) payload.whatsapp_number = toE164(payload.whatsapp_number);

    // Duplicate check: phone, whatsapp_number, or pg_name (case-insensitive)
    const orConditions: any[] = [];
    if (payload.phone) orConditions.push({ phone: payload.phone });
    if (payload.whatsapp_number) orConditions.push({ whatsapp_number: payload.whatsapp_number });
    if (payload.pg_name) orConditions.push({ pg_name: { equals: payload.pg_name } });

    if (orConditions.length) {
      const existing = await this.prisma.crm_contacts.findFirst({
        where: { OR: orConditions, is_deleted: false },
        select: { s_no: true, phone: true, whatsapp_number: true, pg_name: true },
      });
      if (existing) {
        const reasons: string[] = [];
        if (payload.phone && existing.phone === payload.phone) reasons.push('phone');
        if (payload.whatsapp_number && existing.whatsapp_number === payload.whatsapp_number) reasons.push('whatsapp number');
        if (payload.pg_name && existing.pg_name === payload.pg_name) reasons.push('PG name');
        throw new Error(`Duplicate contact detected (matches existing contact #${existing.s_no} by ${reasons.join(', ')})`);
      }
    }

    return this.prisma.crm_contacts.create({ data: payload });
  }

  async bulkImportContacts(rows: any[], filename: string, uploadedBy?: number) {
    const batch = await this.prisma.crm_import_batches.create({
      data: {
        filename,
        total_rows: rows.length,
        uploaded_by: uploadedBy ?? 1,
      },
    });

    const VALID_SOURCES = ['GOOGLE', 'EXCEL', 'MANUAL', 'REFERRAL', 'WEBSITE', 'OTHER'];

    const isBlankLike = (v: any) => {
      if (v === undefined || v === null) return true;
      const str = String(v).trim();
      const blanks = ['', '-', '—', '--', '___', '_', 'n/a', 'na', 'nil', 'none', 'null'];
      return blanks.includes(str.toLowerCase());
    };

    const toNull = (v: any) => (isBlankLike(v) ? null : String(v).trim());
    const toPhone = (v: any) => toE164(v);

    const toNumber = (v: any, allowFloat = false) => {
      if (isBlankLike(v)) return null;
      const num = Number(v);
      if (Number.isNaN(num)) throw new Error(`Invalid number "${v}"`);
      if (!allowFloat && !Number.isInteger(num)) throw new Error(`Expected whole number, got "${v}"`);
      return num;
    };

    const toRating = (v: any) => {
      const num = toNumber(v, true);
      if (num === null) return null;
      if (num < 0 || num > 5) throw new Error(`google_rating must be between 0 and 5, got "${v}"`);
      return num;
    };

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const toEmail = (v: any) => {
      const email = toNull(v);
      if (!email) return null;
      if (!EMAIL_RE.test(email)) throw new Error(`Invalid email "${email}"`);
      return email;
    };

    const toUrl = (v: any, fieldName: string) => {
      let url = toNull(v);
      if (!url) return null;
      url = url.toLowerCase().startsWith('www.') ? `https://${url}` : url;
      // Allow domain-like URLs missing a scheme and normalize them
      if (!/^https?:\/\//i.test(url) && /^[^\s]+\.[^\s]+/.test(url)) {
        url = `https://${url}`;
      }
      if (!/^https?:\/\/.+/i.test(url)) {
        throw new Error(`Invalid ${fieldName} "${url}"`);
      }
      return url;
    };

    let imported = 0;
    let duplicates = 0;
    const failed: any[] = [];
    const duplicateRows: any[] = [];
    const cityCache = new Map<string, { city_id: number; state_id: number; country_id: number } | null>();
    const seenPhones = new Set<string>();
    const seenWhatsapp = new Set<string>();
    const seenPgNames = new Set<string>();

    // Pre-fetch existing phones, whatsapp numbers, and pg_names from DB for duplicate check
    const phonesInBatch = rows
      .map((r) => toPhone(r.phone))
      .filter((p): p is string => !!p);
    const whatsappInBatch = rows
      .map((r) => toPhone(r.whatsapp_number))
      .filter((w): w is string => !!w);
    const pgNamesInBatch = rows
      .map((r) => (r.pg_name ?? '').toString().trim())
      .filter((n): n is string => !!n);

    const orConditions: any[] = [];
    if (phonesInBatch.length) orConditions.push({ phone: { in: phonesInBatch } });
    if (whatsappInBatch.length) orConditions.push({ whatsapp_number: { in: whatsappInBatch } });
    if (pgNamesInBatch.length) orConditions.push({ pg_name: { in: pgNamesInBatch } });

    const existingContacts = orConditions.length
      ? await this.prisma.crm_contacts.findMany({
          where: { OR: orConditions, is_deleted: false },
          select: { phone: true, whatsapp_number: true, pg_name: true },
        })
      : [];
    const existingPhones = new Set(existingContacts.map((c) => c.phone).filter(Boolean));
    const existingWhatsapp = new Set(existingContacts.map((c) => c.whatsapp_number).filter(Boolean));
    const existingPgNames = new Set(existingContacts.map((c) => c.pg_name).filter(Boolean));

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (!row.pg_name || typeof row.pg_name !== 'string' || !row.pg_name.trim()) {
          throw new Error('pg_name is required');
        }

        // Parse primary and alternate phone. Supports "8883130406 / 9840885444" in the phone column
        const rawPhone = String(row.phone ?? '').trim();
        const phoneParts = rawPhone
          .split(/\s*[/,|&]\s*/)
          .map((p) => toPhone(p))
          .filter((p): p is string => !!p);

        const phone = phoneParts[0] ?? null;
        const alternate_phone = toPhone(row.alternate_phone) ?? phoneParts[1] ?? null;
        const whatsapp_number = toPhone(row.whatsapp_number);

        // A contact must have at least a phone or a whatsapp number
        if (!phone && !whatsapp_number) {
          throw new Error('Phone or WhatsApp number is required');
        }

        // Check duplicate by phone, whatsapp, or pg_name — in DB or within this batch
        const pgName = row.pg_name.trim();
        let dupReason = '';
        if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
          dupReason = `phone ${phone}`;
        } else if (whatsapp_number && (existingWhatsapp.has(whatsapp_number) || seenWhatsapp.has(whatsapp_number))) {
          dupReason = `whatsapp ${whatsapp_number}`;
        } else if (existingPgNames.has(pgName) || seenPgNames.has(pgName)) {
          dupReason = `pg_name "${pgName}"`;
        }

        if (dupReason) {
          duplicates++;
          duplicateRows.push({ row: i + 1, reason: dupReason, pg_name: row.pg_name, data: rows[i] });
          continue;
        }

        if (phone) seenPhones.add(phone);
        if (whatsapp_number) seenWhatsapp.add(whatsapp_number);
        seenPgNames.add(pgName);

        let country_id = row.country_id ? Number(row.country_id) : null;
        let state_id = row.state_id ? Number(row.state_id) : null;
        let city_id = row.city_id ? Number(row.city_id) : null;

        // If row has a city_name string but no city_id, resolve from consumer DB
        const cityName = (row.city_name || row.city || '').toString().trim();
        if (cityName && !city_id) {
          let cached = cityCache.get(cityName.toLowerCase());
          if (cached === undefined) {
            const city = await this.consumerPrisma.city.findFirst({
              where: { name: { equals: cityName } },
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
              cached = {
                city_id: city.s_no,
                state_id: state?.s_no ?? null,
                country_id: country?.s_no ?? null,
              };
            } else {
              cached = null;
            }
            cityCache.set(cityName.toLowerCase(), cached);
          }
          if (cached) {
            city_id = cached.city_id;
            state_id = state_id || cached.state_id;
            country_id = country_id || cached.country_id;
          }
        }

        if (!city_id || !state_id) {
          throw new Error('Valid city and state are required');
        }

        // Validate numeric fields
        const no_of_rooms = toNumber(row.no_of_rooms, false);
        const google_rating = toRating(row.google_rating);

        // Validate email and URLs
        const email = toEmail(row.email);
        const google_maps_url = toUrl(row.google_maps_url, 'google_maps_url');
        const website = toUrl(row.website, 'website');

        // Validate source against enum values
        const rawSource = toNull(row.source);
        const source = rawSource && VALID_SOURCES.includes(rawSource.toUpperCase())
          ? rawSource.toUpperCase()
          : 'EXCEL';

        await this.prisma.crm_contacts.create({
          data: {
            pg_name: row.pg_name.trim(),
            owner_name: toNull(row.owner_name),
            designation: toNull(row.designation),
            phone,
            alternate_phone,
            whatsapp_number,
            email,
            country_id,
            state_id,
            city_id,
            area: toNull(row.area),
            address: toNull(row.address),
            no_of_rooms,
            google_maps_url,
            google_rating,
            website,
            tags: toNull(row.tags),
            notes: toNull(row.notes),
            source: source as any,
            import_batch_id: batch.s_no,
          },
        });
        imported++;
      } catch (err: any) {
        const failedRow = rows[i];
        failed.push({
          row: i + 1,
          phone: toPhone(failedRow.phone) ?? failedRow.phone ?? null,
          pg_name: failedRow.pg_name ?? '',
          error: err.message,
          data: failedRow,
        });
      }
    }

    await this.prisma.crm_import_batches.update({
      where: { s_no: batch.s_no },
      data: {
        imported_count: imported,
        failed_count: failed.length + duplicates,
        failed_rows: JSON.stringify([...failed, ...duplicateRows.map((d) => ({ ...d, error: 'Duplicate phone number' }))]),
      },
    });

    return {
      batch_id: batch.s_no,
      total: rows.length,
      imported,
      duplicates,
      duplicate_rows: duplicateRows,
      failed: failed.length,
      failed_rows: failed,
    };
  }

  async getContact(id: number) {
    const data = await this.prisma.crm_contacts.findUnique({ where: { s_no: id } });
    if (!data) throw new NotFoundException('Contact not found');
    const [enriched] = await this.enrichWithLocation([data]);
    return enriched;
  }

  async updateContact(id: number, data: Parameters<typeof this.prisma.crm_contacts.update>[0]['data']) {
    await this.getContact(id);
    const payload = { ...data } as any;
    if (payload.phone) payload.phone = toE164(payload.phone);
    if (payload.alternate_phone) payload.alternate_phone = toE164(payload.alternate_phone);
    if (payload.whatsapp_number) payload.whatsapp_number = toE164(payload.whatsapp_number);
    return this.prisma.crm_contacts.update({ where: { s_no: id }, data: payload });
  }

  async softDeleteContact(id: number) {
    await this.getContact(id);
    return this.prisma.crm_contacts.update({ where: { s_no: id }, data: { is_deleted: true } });
  }

  async bulkConvertContactsToLead(contactIds: number[], assigned_to?: number) {
    if (!contactIds?.length) {
      return { total: 0, converted: 0, skipped: 0, failed: 0, errors: [] };
    }

    // Fetch valid, non-deleted contacts
    const contacts = await this.prisma.crm_contacts.findMany({
      where: { s_no: { in: contactIds }, is_deleted: false },
      select: { s_no: true },
    });
    const validIds = contacts.map((c) => c.s_no);

    if (!validIds.length) {
      return { total: contactIds.length, converted: 0, skipped: 0, failed: contactIds.length, errors: ['No valid contacts found'] };
    }

    // Find contacts that already have leads (to skip)
    const existingLeads = await this.prisma.crm_leads.findMany({
      where: { contact_id: { in: validIds } },
      select: { contact_id: true },
    });
    const existingIds = new Set(existingLeads.map((l) => l.contact_id));
    const toCreate = validIds.filter((id) => !existingIds.has(id));
    const toUpdateStatus = toCreate; // only update status for newly converted

    let converted = 0;
    const errors: any[] = [];

    // Batch create leads in chunks of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      try {
        await this.prisma.crm_leads.createMany({
          data: batch.map((contactId) => ({
            contact_id: contactId,
            ...(assigned_to ? { assigned_to } : {}),
          })),
          skipDuplicates: true,
        });
        converted += batch.length;
      } catch (err: any) {
        errors.push({ batch: i, error: err.message });
      }
    }

    // If assigned_to was provided, update existing leads for contacts that already had leads
    if (assigned_to && existingIds.size > 0) {
      const existingContactIds = [...existingIds].filter((id) => validIds.includes(id));
      if (existingContactIds.length) {
        await this.prisma.crm_leads.updateMany({
          where: { contact_id: { in: existingContactIds } },
          data: { assigned_to },
        }).catch(() => undefined);
      }
    }

    // Bulk update contact statuses for newly converted contacts
    if (toUpdateStatus.length) {
      for (let i = 0; i < toUpdateStatus.length; i += BATCH_SIZE) {
        const batch = toUpdateStatus.slice(i, i + BATCH_SIZE);
        await this.prisma.crm_contacts.updateMany({
          where: { s_no: { in: batch } },
          data: { status: 'CONVERTED_TO_LEAD' as any },
        }).catch(() => undefined);
      }
    }

    return {
      total: contactIds.length,
      converted,
      skipped: existingIds.size,
      failed: contactIds.length - validIds.length,
      errors,
    };
  }

  // LEADS
  // Stage scores are now read from the crm_lead_stages table (see getStageScoreMap)
  private PRIORITY_SCORE: Record<string, number> = {
    LOW: 2,
    MEDIUM: 5,
    HIGH: 10,
    URGENT: 15,
  };

  async recalculateScore(leadId: number): Promise<number> {
    const lead = await this.prisma.crm_leads.findUnique({ where: { s_no: leadId } });
    if (!lead) return 0;

    const [activityCount, visitCount, stageScoreMap] = await Promise.all([
      this.prisma.crm_lead_activities.count({ where: { lead_id: leadId, is_deleted: false } }),
      this.prisma.crm_site_visits.count({ where: { lead_id: leadId, is_deleted: false, status: 'COMPLETED' } }),
      this.getStageScoreMap(),
    ]);

    const stageScore = stageScoreMap[lead.stage ?? 'NEW'] ?? 0;
    const priorityScore = this.PRIORITY_SCORE[lead.priority] ?? 0;
    const activityScore = Math.min(activityCount * 3, 15);
    const visitScore = Math.min(visitCount * 10, 20);

    const total = Math.min(100, stageScore + priorityScore + activityScore + visitScore);

    await this.prisma.crm_leads.update({ where: { s_no: leadId }, data: { score: total } });
    return total;
  }

  async convertContactToLead(contactId: number, assigned_to?: number) {
    // ensure contact exists
    const contact = await this.getContact(contactId);
    const lead = await this.prisma.crm_leads.upsert({
      where: { contact_id: contactId },
      update: assigned_to
        ? { user: { connect: { s_no: assigned_to } } }
        : {},
      create: {
        crm_contacts: { connect: { s_no: contactId } },
        ...(assigned_to ? { user: { connect: { s_no: assigned_to } } } : {}),
      },
    });
    // update contact status
    await this.prisma.crm_contacts.update({ where: { s_no: contact.s_no }, data: { status: 'CONVERTED_TO_LEAD' as any } });
    return lead;
  }

  async listLeads(params: { page?: number; limit?: number; stage?: string; priority?: string; assigned_to?: number; search?: string; sortBy?: string; sortOrder?: string; scoreMin?: number; scoreMax?: number }): Promise<[any[], number]> {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { is_deleted: false };
    if (params.stage) where.stage = params.stage as any;
    if (params.priority) where.priority = params.priority as any;
    if (params.assigned_to) where.assigned_to = Number(params.assigned_to);
    if (params.scoreMin != null || params.scoreMax != null) {
      where.score = {};
      if (params.scoreMin != null) where.score.gte = Number(params.scoreMin);
      if (params.scoreMax != null) where.score.lte = Number(params.scoreMax);
    }

    if (params.search) {
      const q = params.search.trim();
      // For phone searches: strip non-digits so "3789" matches "+919876543789"
      const digitsOnly = q.replace(/\D/g, '');
      const phoneConditions: any[] = [
        { crm_contacts: { phone: { contains: q } } },
        { crm_contacts: { alternate_phone: { contains: q } } },
      ];
      if (digitsOnly && digitsOnly !== q) {
        phoneConditions.push({ crm_contacts: { phone: { contains: digitsOnly } } });
        phoneConditions.push({ crm_contacts: { alternate_phone: { contains: digitsOnly } } });
      }
      where.OR = [
        { crm_contacts: { pg_name: { contains: q } } },
        { crm_contacts: { owner_name: { contains: q } } },
        ...phoneConditions,
      ];
    }

    const allowedSortFields = ['s_no', 'stage', 'priority', 'score', 'created_at', 'updated_at', 'expected_close_date', 'expected_value', 'next_follow_up_date', 'last_activity_at', 'tags'];
    const sortBy = allowedSortFields.includes(params.sortBy ?? '') ? params.sortBy! : 'updated_at';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.crm_leads.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: { crm_contacts: true, user: true, crm_lead_stages: true },
      }),
      this.prisma.crm_leads.count({ where }),
    ]);
    const contacts = rows.map((r) => r.crm_contacts).filter(Boolean);
    const enrichedContacts = await this.enrichWithLocation(contacts);
    const contactMap = new Map(enrichedContacts.map((c) => [c.s_no, c]));
    const enrichedLeads = rows.map((r) => ({
      ...r,
      crm_contacts: r.crm_contacts ? contactMap.get(r.crm_contacts.s_no) ?? r.crm_contacts : r.crm_contacts,
    }));
    return [enrichedLeads, total];
  }

  async getLead(id: number) {
    const data = await this.prisma.crm_leads.findUnique({ where: { s_no: id }, include: { crm_contacts: true, user: true, crm_lead_stages: true } });
    if (!data) throw new NotFoundException('Lead not found');
    if (data.crm_contacts) {
      const [enriched] = await this.enrichWithLocation([data.crm_contacts]);
      data.crm_contacts = enriched as any;
    }
    return data;
  }

  async updateLead(id: number, data: Parameters<typeof this.prisma.crm_leads.update>[0]['data']) {
    await this.getLead(id);

    // Normalize date fields: convert "YYYY-MM-DD" to full ISO-8601 DateTime
    // Prisma expects ISO-8601 for DateTime fields, but the frontend sends date-only strings
    const payload = { ...data } as any;
    const dateFields = ['next_follow_up_date', 'expected_close_date'];
    for (const field of dateFields) {
      if (field in payload && payload[field]) {
        const val = payload[field];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          // "2026-08-17" -> "2026-08-17T00:00:00.000Z"
          payload[field] = new Date(val + 'T00:00:00.000Z');
        } else if (typeof val === 'string' && val.trim() === '') {
          payload[field] = null;
        }
      }
    }

    const updated = await this.prisma.crm_leads.update({ where: { s_no: id }, data: payload });
    if (data && ('stage' in data || 'priority' in data)) {
      await this.recalculateScore(id);
    }
    return updated;
  }

  async updateLeadStage(id: number, stage: any) {
    await this.getLead(id);
    const updated = await this.prisma.crm_leads.update({ where: { s_no: id }, data: { stage } });
    await this.recalculateScore(id);
    return updated;
  }

  async softDeleteLead(id: number) {
    await this.getLead(id);
    return this.prisma.crm_leads.update({
      where: { s_no: id },
      data: { is_deleted: true, deleted_at: new Date() },
    });
  }

  // ACTIVITIES
  listActivities(leadId: number) {
    return this.prisma.crm_lead_activities.findMany({ where: { lead_id: leadId, is_deleted: false }, orderBy: { created_at: 'desc' } });
  }

  async createActivity(leadId: number, data: Parameters<typeof this.prisma.crm_lead_activities.create>[0]['data']) {
    // ensure lead exists
    await this.getLead(leadId);
    const { user_id, ...rest } = (data as any) ?? {};

    // Normalize date fields: convert "YYYY-MM-DD" to full ISO-8601 DateTime
    const dateFields = ['scheduled_at', 'completed_at'];
    for (const field of dateFields) {
      if (field in rest && rest[field]) {
        const val = rest[field];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          rest[field] = new Date(val + 'T00:00:00.000Z');
        } else if (typeof val === 'string' && val.trim() === '') {
          rest[field] = null;
        }
      }
    }

    const activity = await this.prisma.crm_lead_activities.create({
      data: {
        ...rest,
        crm_leads: { connect: { s_no: leadId } },
        ...(user_id ? { user: { connect: { s_no: Number(user_id) } } } : {}),
      } as any,
    });
    await this.prisma.crm_leads.update({ where: { s_no: leadId }, data: { last_activity_at: new Date() } });
    await this.recalculateScore(leadId);
    return activity;
  }

  // SITE VISITS
  listSiteVisits(params: { page?: number; limit?: number; assigned_to?: number; status?: string; date?: string }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { is_deleted: false };
    if (params.assigned_to) where.assigned_to = Number(params.assigned_to);
    if (params.status) where.status = params.status as any;
    if (params.date) where.visit_date = { gte: new Date(params.date), lt: new Date(new Date(params.date).getTime() + 86400000) };

    return this.prisma.$transaction([
      this.prisma.crm_site_visits.findMany({ where, orderBy: { visit_date: 'desc' }, skip: (page - 1) * limit, take: limit, include: { crm_contacts: true, crm_leads: true, user: true } }),
      this.prisma.crm_site_visits.count({ where }),
    ]);
  }

  async scheduleVisit(contactId: number, data: Parameters<typeof this.prisma.crm_site_visits.create>[0]['data']) {
    await this.getContact(contactId);
    const { assigned_to, lead_id, ...rest } = (data as any) ?? {};

    // Normalize date fields: convert "YYYY-MM-DD" to full ISO-8601 DateTime
    const dateFields = ['visit_date', 'completed_at', 'cancelled_at'];
    for (const field of dateFields) {
      if (field in rest && rest[field]) {
        const val = rest[field];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          rest[field] = new Date(val + 'T00:00:00.000Z');
        } else if (typeof val === 'string' && val.trim() === '') {
          rest[field] = null;
        }
      }
    }

    return this.prisma.crm_site_visits.create({
      data: {
        ...rest,
        crm_contacts: { connect: { s_no: contactId } },
        ...(lead_id ? { crm_leads: { connect: { s_no: Number(lead_id) } } } : {}),
        user: { connect: { s_no: Number(assigned_to) } },
      } as any,
    });
  }

  async updateVisit(id: number, data: Parameters<typeof this.prisma.crm_site_visits.update>[0]['data']) {
    const existing = await this.prisma.crm_site_visits.findUnique({ where: { s_no: id } });
    if (!existing) throw new NotFoundException('Visit not found');

    // Normalize date fields: convert "YYYY-MM-DD" to full ISO-8601 DateTime
    const payload = { ...data } as any;
    const dateFields = ['visit_date', 'completed_at', 'cancelled_at'];
    for (const field of dateFields) {
      if (field in payload && payload[field]) {
        const val = payload[field];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          payload[field] = new Date(val + 'T00:00:00.000Z');
        } else if (typeof val === 'string' && val.trim() === '') {
          payload[field] = null;
        }
      }
    }

    const updated = await this.prisma.crm_site_visits.update({ where: { s_no: id }, data: payload });
    if (existing.lead_id && (data as any)?.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      await this.recalculateScore(existing.lead_id);
    }
    return updated;
  }

  // SUBSCRIBERS
  listSubscribers(params: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { is_deleted: false };
    if (params.search) {
      const q = params.search.trim();
      const digitsOnly = q.replace(/\D/g, '');
      const phoneConditions: any[] = [
        { crm_leads: { crm_contacts: { phone: { contains: q } } } },
        { crm_leads: { crm_contacts: { alternate_phone: { contains: q } } } },
      ];
      if (digitsOnly && digitsOnly !== q) {
        phoneConditions.push({ crm_leads: { crm_contacts: { phone: { contains: digitsOnly } } } });
        phoneConditions.push({ crm_leads: { crm_contacts: { alternate_phone: { contains: digitsOnly } } } });
      }
      where.OR = [
        { crm_leads: { crm_contacts: { pg_name: { contains: q } } } },
        { crm_leads: { crm_contacts: { owner_name: { contains: q } } } },
        ...phoneConditions,
        { plan_name: { contains: q } },
      ];
    }
    return this.prisma.$transaction([
      this.prisma.crm_subscribers.findMany({
        where,
        orderBy: { conversion_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { crm_leads: { include: { crm_contacts: true } }, user: true },
      }),
      this.prisma.crm_subscribers.count({ where }),
    ]);
  }

  async getSubscriber(id: number) {
    const data = await this.prisma.crm_subscribers.findUnique({
      where: { s_no: id },
      include: { crm_leads: { include: { crm_contacts: true } }, user: true },
    });
    if (!data) throw new NotFoundException('Subscriber not found');
    return data;
  }

  async convertLeadToSubscriber(leadId: number, data: Parameters<typeof this.prisma.crm_subscribers.create>[0]['data']) {
    await this.getLead(leadId);
    const { user_id, ...rest } = (data as any) ?? {};
    const sub = await this.prisma.crm_subscribers.upsert({
      where: { lead_id: leadId },
      update: user_id ? { user: { connect: { s_no: Number(user_id) } } } : {},
      create: {
        ...rest,
        crm_leads: { connect: { s_no: leadId } },
        ...(user_id ? { user: { connect: { s_no: Number(user_id) } } } : {}),
      } as any,
    });
    await this.prisma.crm_leads.update({ where: { s_no: leadId }, data: { stage: 'WON' as any, converted_at: new Date() } });
    // Update the related contact status to CONVERTED_TO_SUBSCRIBER
    const lead = await this.prisma.crm_leads.findUnique({ where: { s_no: leadId } });
    if (lead?.contact_id) {
      await this.prisma.crm_contacts
        .update({ where: { s_no: lead.contact_id }, data: { status: 'CONVERTED_TO_SUBSCRIBER' as any } })
        .catch(() => undefined);
    }
    return sub;
  }

  // LEAD STAGES (dynamic lookup table)
  async listLeadStages(includeInactive = false) {
    const where: any = {};
    if (!includeInactive) where.is_active = true;
    return this.prisma.crm_lead_stages.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { s_no: 'asc' }],
    });
  }

  async getLeadStage(id: number) {
    const stage = await this.prisma.crm_lead_stages.findUnique({ where: { s_no: id } });
    if (!stage) throw new NotFoundException(`Lead stage #${id} not found`);
    return stage;
  }

  async createLeadStage(data: { name: string; label: string; color?: string; score?: number; sort_order?: number; is_active?: boolean }) {
    const name = data.name.toUpperCase().replace(/\s+/g, '_');
    return this.prisma.crm_lead_stages.create({
      data: {
        name,
        label: data.label,
        color: data.color ?? 'secondary',
        score: data.score ?? 0,
        sort_order: data.sort_order ?? 99,
        is_active: data.is_active ?? true,
        is_system: false,
      },
    });
  }

  async updateLeadStageConfig(id: number, data: { label?: string; color?: string; score?: number; sort_order?: number; is_active?: boolean }) {
    const existing = await this.getLeadStage(id);
    // System stages: only allow updating color/sort_order/is_active, not label
    const updateData: any = {};
    if (data.label !== undefined && !existing.is_system) updateData.label = data.label;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.score !== undefined && !existing.is_system) updateData.score = data.score;
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    return this.prisma.crm_lead_stages.update({ where: { s_no: id }, data: updateData });
  }

  async deleteLeadStage(id: number) {
    const existing = await this.getLeadStage(id);
    if (existing.is_system) {
      throw new Error(`Cannot delete system stage "${existing.name}"`);
    }
    // Check if any leads are using this stage
    const count = await this.prisma.crm_leads.count({ where: { stage: existing.name } });
    if (count > 0) {
      throw new Error(`Cannot delete stage "${existing.name}" — ${count} lead(s) are using it. Disable it instead.`);
    }
    return this.prisma.crm_lead_stages.delete({ where: { s_no: id } });
  }

  // Helper: get stage score from DB (cached in-memory for 5 minutes)
  private stageScoreCache: { data: Record<string, number> | null; expiresAt: number } = { data: null, expiresAt: 0 };

  private async getStageScoreMap(): Promise<Record<string, number>> {
    const now = Date.now();
    if (this.stageScoreCache.data && now < this.stageScoreCache.expiresAt) {
      return this.stageScoreCache.data;
    }
    const stages = await this.prisma.crm_lead_stages.findMany({ select: { name: true, score: true } });
    const map: Record<string, number> = {};
    for (const s of stages) {
      map[s.name] = s.score ?? 0;
    }
    this.stageScoreCache.data = map;
    this.stageScoreCache.expiresAt = now + 5 * 60 * 1000; // 5 min cache
    return map;
  }
}
