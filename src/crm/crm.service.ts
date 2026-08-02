import { Injectable, NotFoundException } from '@nestjs/common';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';

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
      where.OR = [
        { pg_name: { contains: q } },
        { owner_name: { contains: q } },
        { phone: { contains: q } },
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

  async createContact(data: Parameters<typeof this.prisma.crm_contacts.create>[0]['data']) {
    return this.prisma.crm_contacts.create({ data });
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
    const toNull = (v: any) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

    let imported = 0;
    let duplicates = 0;
    const failed: any[] = [];
    const duplicateRows: any[] = [];
    const cityCache = new Map<string, { city_id: number; state_id: number; country_id: number } | null>();
    const seenPhones = new Set<string>();

    // Pre-fetch existing phones from DB for duplicate check
    const phonesInBatch = rows
      .map((r) => toNull(r.phone))
      .filter((p): p is string => !!p);

    const existingContacts = phonesInBatch.length
      ? await this.prisma.crm_contacts.findMany({
          where: { phone: { in: phonesInBatch }, is_deleted: false },
          select: { phone: true },
        })
      : [];
    const existingPhones = new Set(existingContacts.map((c) => c.phone));

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (!row.pg_name || typeof row.pg_name !== 'string' || !row.pg_name.trim()) {
          throw new Error('pg_name is required');
        }

        const phone = toNull(row.phone);

        // Check duplicate phone — in DB or within this batch
        if (phone) {
          if (existingPhones.has(phone) || seenPhones.has(phone)) {
            duplicates++;
            duplicateRows.push({ row: i + 1, phone, pg_name: row.pg_name, data: rows[i] });
            continue;
          }
          seenPhones.add(phone);
        }

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
            whatsapp_number: toNull(row.whatsapp_number),
            email: toNull(row.email),
            country_id,
            state_id,
            city_id,
            area: toNull(row.area),
            address: toNull(row.address),
            no_of_rooms: row.no_of_rooms ? Number(row.no_of_rooms) : null,
            google_maps_url: toNull(row.google_maps_url),
            google_rating: row.google_rating ? Number(row.google_rating) : null,
            website: toNull(row.website),
            tags: toNull(row.tags),
            notes: toNull(row.notes),
            source: source as any,
            import_batch_id: batch.s_no,
          },
        });
        imported++;
      } catch (err: any) {
        failed.push({ row: i + 1, error: err.message, data: rows[i] });
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
    return this.prisma.crm_contacts.update({ where: { s_no: id }, data });
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
  private STAGE_SCORE: Record<string, number> = {
    NEW: 5,
    CONTACTED: 15,
    INTERESTED: 30,
    DEMO_SCHEDULED: 50,
    NEGOTIATION: 70,
    WON: 100,
    LOST: 0,
  };

  private PRIORITY_SCORE: Record<string, number> = {
    LOW: 2,
    MEDIUM: 5,
    HIGH: 10,
    URGENT: 15,
  };

  async recalculateScore(leadId: number): Promise<number> {
    const lead = await this.prisma.crm_leads.findUnique({ where: { s_no: leadId } });
    if (!lead) return 0;

    const [activityCount, visitCount] = await Promise.all([
      this.prisma.crm_lead_activities.count({ where: { lead_id: leadId, is_deleted: false } }),
      this.prisma.crm_site_visits.count({ where: { lead_id: leadId, is_deleted: false, status: 'COMPLETED' } }),
    ]);

    const stageScore = this.STAGE_SCORE[lead.stage] ?? 0;
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
      where.OR = [
        { crm_contacts: { pg_name: { contains: q } } },
        { crm_contacts: { owner_name: { contains: q } } },
        { crm_contacts: { phone: { contains: q } } },
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
        include: { crm_contacts: true, user: true },
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
    const data = await this.prisma.crm_leads.findUnique({ where: { s_no: id }, include: { crm_contacts: true, user: true } });
    if (!data) throw new NotFoundException('Lead not found');
    if (data.crm_contacts) {
      const [enriched] = await this.enrichWithLocation([data.crm_contacts]);
      data.crm_contacts = enriched as any;
    }
    return data;
  }

  async updateLead(id: number, data: Parameters<typeof this.prisma.crm_leads.update>[0]['data']) {
    await this.getLead(id);
    const updated = await this.prisma.crm_leads.update({ where: { s_no: id }, data });
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
    const updated = await this.prisma.crm_site_visits.update({ where: { s_no: id }, data });
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
      where.OR = [
        { crm_leads: { crm_contacts: { pg_name: { contains: q } } } },
        { crm_leads: { crm_contacts: { owner_name: { contains: q } } } },
        { crm_leads: { crm_contacts: { phone: { contains: q } } } },
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
}
