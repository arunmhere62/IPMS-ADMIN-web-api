import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ManagementPrismaService } from '../prisma/management-prisma.service';
import { MessageEntityType } from './dto/send-message.dto';

export interface MessageContext {
  entityType: MessageEntityType;
  entityId: number;
  senderUserId: number;
  manualVariables?: Record<string, string>;
}

@Injectable()
export class VariableResolverService {
  constructor(
    private readonly consumerPrisma: ConsumerPrismaService,
    private readonly managementPrisma: ManagementPrismaService,
  ) {}

  getAvailablePlaceholders(): {
    groups: { label: string; items: { key: string; label: string; description: string }[] }[];
  } {
    return {
      groups: [
        {
          label: 'Recipient',
          items: [
            { key: 'recipient_name', label: 'Recipient Name', description: 'Name of the person receiving the message' },
            { key: 'recipient_phone', label: 'Recipient Phone', description: 'Phone number of the recipient' },
            { key: 'recipient_email', label: 'Recipient Email', description: 'Email address of the recipient' },
            { key: 'tenant_name', label: 'Tenant Name', description: 'Tenant name (tenant entity only)' },
            { key: 'pg_name', label: 'PG Name', description: 'PG/property name' },
            { key: 'pg_address', label: 'PG Address', description: 'PG/property address' },
            { key: 'organization_name', label: 'Organization', description: 'Organization/company name' },
          ],
        },
        {
          label: 'Sender',
          items: [
            { key: 'sender_name', label: 'Sender Name', description: 'Name of the staff member sending the message' },
            { key: 'sender_email', label: 'Sender Email', description: 'Email of the staff member sending the message' },
          ],
        },
        {
          label: 'Links',
          items: [
            { key: 'playstore_link', label: 'Play Store Link', description: 'Android app Play Store URL' },
            { key: 'appstore_link', label: 'App Store Link', description: 'iOS app App Store URL' },
            { key: 'website_url', label: 'Website URL', description: 'Organization website URL' },
          ],
        },
        {
          label: 'Support',
          items: [
            { key: 'support_phone', label: 'Support Phone', description: 'Support contact phone number' },
            { key: 'support_email', label: 'Support Email', description: 'Support contact email address' },
          ],
        },
        {
          label: 'Date',
          items: [
            { key: 'today', label: 'Today', description: 'Current date in DD/MM/YYYY format' },
          ],
        },
        {
          label: 'Aliases',
          items: [
            { key: 'name', label: 'Name (alias)', description: 'Short alias for recipient_name' },
            { key: 'phone', label: 'Phone (alias)', description: 'Short alias for recipient_phone' },
            { key: 'email', label: 'Email (alias)', description: 'Short alias for recipient_email' },
            { key: 'company', label: 'Company (alias)', description: 'Short alias for organization_name' },
            { key: 'org', label: 'Org (alias)', description: 'Short alias for organization_name' },
          ],
        },
      ],
    };
  }

  async resolve(ctx: MessageContext): Promise<Record<string, string>> {
    const [entityVars, senderVars] = await Promise.all([
      this.resolveEntityVariables(ctx.entityType, ctx.entityId),
      this.resolveSenderVariables(ctx.senderUserId),
    ]);

    const base: Record<string, string> = {
      ...entityVars,
      ...senderVars,
      today: this.formatDate(new Date()),
      ...this.sanitizeManualVariables(ctx.manualVariables),
    };

    return {
      ...base,
      name: base.recipient_name ?? '',
      phone: base.recipient_phone ?? '',
      email: base.recipient_email ?? '',
      company: base.organization_name ?? '',
      org: base.organization_name ?? '',
      playstore_link: process.env.PLAYSTORE_LINK ?? 'https://play.google.com/store/apps/details?id=com.indianpgmanagement.ipms',
      appstore_link: process.env.APPSTORE_LINK ?? '#',
      website_url: process.env.WEBSITE_URL ?? 'https://www.indianpgmanagement.com',
      support_phone: process.env.SUPPORT_PHONE ?? base.recipient_phone ?? '',
      support_email: process.env.SUPPORT_EMAIL ?? base.sender_email ?? '',
    };
  }

  renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      return variables[key] ?? `{{${key}}}`;
    });
  }

  extractPlaceholders(template: string): string[] {
    const matches = template.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
    const keys = new Set<string>();
    for (const match of matches) {
      keys.add(match[1]);
    }
    return Array.from(keys);
  }

  getKnownKeys(): Set<string> {
    const { groups } = this.getAvailablePlaceholders();
    const keys = new Set<string>();
    for (const group of groups) {
      for (const item of group.items) {
        keys.add(item.key);
      }
    }
    return keys;
  }

  validatePlaceholders(
    template: string,
    manualVariables?: Record<string, string>,
  ): { valid: boolean; unknown: string[] } {
    const usedKeys = this.extractPlaceholders(template);
    const knownKeys = this.getKnownKeys();
    if (manualVariables) {
      for (const key of Object.keys(manualVariables)) {
        knownKeys.add(key);
      }
    }
    const unknown = usedKeys.filter((key) => !knownKeys.has(key));
    return { valid: unknown.length === 0, unknown };
  }

  private async resolveEntityVariables(
    entityType: MessageEntityType,
    entityId: number,
  ): Promise<Record<string, string>> {
    switch (entityType) {
      case MessageEntityType.TENANT:
        return this.resolveTenant(entityId);
      case MessageEntityType.CONTACT:
        return this.resolveContact(entityId);
      case MessageEntityType.LEAD:
        return this.resolveLead(entityId);
      case MessageEntityType.USER:
        return this.resolveUser(entityId);
      default:
        throw new NotFoundException(`Unsupported entity type: ${entityType}`);
    }
  }

  private async resolveTenant(entityId: number): Promise<Record<string, string>> {
    const tenant = await this.consumerPrisma.tenants.findUnique({
      where: { s_no: entityId },
      include: { pg_locations: { include: { organization: true } } },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found: ${entityId}`);
    }

    const pg = tenant.pg_locations;

    return {
      recipient_name: tenant.name || '',
      recipient_phone: tenant.phone_no || tenant.whatsapp_number || '',
      recipient_email: tenant.email || '',
      tenant_name: tenant.name || '',
      pg_name: pg?.location_name || '',
      pg_address: pg?.address || '',
      organization_name: pg?.organization?.name || '',
    };
  }

  private async resolveContact(entityId: number): Promise<Record<string, string>> {
    const contact = await this.managementPrisma.crm_contacts.findUnique({
      where: { s_no: entityId },
    });

    if (!contact) {
      throw new NotFoundException(`Contact not found: ${entityId}`);
    }

    return {
      recipient_name: contact.owner_name || contact.pg_name || '',
      recipient_phone: contact.whatsapp_number || contact.phone || '',
      recipient_email: contact.email || '',
      pg_name: contact.pg_name || '',
      pg_address: contact.address || '',
      organization_name: '',
    };
  }

  private async resolveLead(entityId: number): Promise<Record<string, string>> {
    const lead = await this.managementPrisma.crm_leads.findUnique({
      where: { s_no: entityId },
      include: { crm_contacts: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead not found: ${entityId}`);
    }

    const contact = lead.crm_contacts;

    return {
      recipient_name: contact?.owner_name || contact?.pg_name || '',
      recipient_phone: contact?.whatsapp_number || contact?.phone || '',
      recipient_email: contact?.email || '',
      pg_name: contact?.pg_name || '',
      pg_address: contact?.address || '',
      organization_name: '',
    };
  }

  private async resolveUser(entityId: number): Promise<Record<string, string>> {
    const user = await this.consumerPrisma.users.findUnique({
      where: { s_no: entityId },
      include: { organization_users_organization_idToorganization: true },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${entityId}`);
    }

    return {
      recipient_name: user.name || '',
      recipient_phone: user.phone || '',
      recipient_email: user.email || '',
      organization_name: user.organization_users_organization_idToorganization?.name || '',
    };
  }

  private async resolveSenderVariables(senderUserId: number): Promise<Record<string, string>> {
    const user = await this.consumerPrisma.users.findUnique({
      where: { s_no: senderUserId },
    });

    return {
      sender_name: user?.name || '',
      sender_email: user?.email || '',
    };
  }

  private sanitizeManualVariables(
    variables?: Record<string, string>,
  ): Record<string, string> {
    if (!variables) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      if (/^[a-zA-Z_]\w*$/.test(key)) {
        result[key] = value;
      }
    }
    return result;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}
