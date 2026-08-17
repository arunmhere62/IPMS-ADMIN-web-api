/**
 * Enterprise RBAC — Permissions Catalog
 *
 * This file is the single source of truth for every permission in the
 * IPMS-ADMIN-web application. It is used by:
 *   - backend guards (@RequirePermission)
 *   - auth service to build the JWT permissions claim
 *   - frontend hooks/components to hide/disable UI
 *
 * Format: `resource:action` (e.g. `crm.leads:view`).
 * Resources are grouped by business domain. Actions are:
 *   - view    : list/read
 *   - create  : add new records
 *   - update  : edit existing records
 *   - delete  : remove records
 *   - manage  : all actions + configuration (super-set)
 *
 * NOTE: Keep this catalog in sync with the frontend copy at
 * src/lib/permissions.ts.
 */

export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete', 'manage', 'import', 'assign', 'send'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionDefinition = {
  resource: string;
  action: PermissionAction;
  description: string;
};

const makePermission = (resource: string, action: PermissionAction, description: string): PermissionDefinition => ({
  resource,
  action,
  description,
});

export const buildPermissionKey = (resource: string, action: PermissionAction | string): string =>
  `${resource}:${action}`;

export const permissionKey = (permission: PermissionDefinition): string =>
  buildPermissionKey(permission.resource, permission.action);

export const parsePermissionKey = (key: string): { resource: string; action: string } | null => {
  const idx = key.indexOf(':');
  if (idx <= 0 || idx === key.length - 1) return null;
  return { resource: key.slice(0, idx), action: key.slice(idx + 1) };
};

export const ADMIN_PERMISSIONS = {
  // Dashboard & core
  DASHBOARD: {
    VIEW: makePermission('dashboard', 'view', 'View dashboard'),
  },

  // Tickets
  TICKETS: {
    VIEW: makePermission('tickets', 'view', 'View support tickets'),
    CREATE: makePermission('tickets', 'create', 'Create support tickets'),
    UPDATE: makePermission('tickets', 'update', 'Update/assign support tickets'),
    DELETE: makePermission('tickets', 'delete', 'Delete support tickets'),
    MANAGE: makePermission('tickets', 'manage', 'Manage all tickets'),
  },

  // Organizations / PGs
  ORGANIZATIONS: {
    VIEW: makePermission('organizations', 'view', 'View organizations'),
    CREATE: makePermission('organizations', 'create', 'Create organizations'),
    UPDATE: makePermission('organizations', 'update', 'Update organizations'),
    DELETE: makePermission('organizations', 'delete', 'Delete organizations'),
    MANAGE: makePermission('organizations', 'manage', 'Manage all organizations'),
  },

  // Subscription plans
  SUBSCRIPTION_PLANS: {
    VIEW: makePermission('subscription_plans', 'view', 'View subscription plans'),
    CREATE: makePermission('subscription_plans', 'create', 'Create subscription plans'),
    UPDATE: makePermission('subscription_plans', 'update', 'Update subscription plans'),
    DELETE: makePermission('subscription_plans', 'delete', 'Delete subscription plans'),
    MANAGE: makePermission('subscription_plans', 'manage', 'Manage subscription plans'),
  },

  // Legal documents
  LEGAL_DOCUMENTS: {
    VIEW: makePermission('legal_documents', 'view', 'View legal documents'),
    CREATE: makePermission('legal_documents', 'create', 'Create legal documents'),
    UPDATE: makePermission('legal_documents', 'update', 'Update legal documents'),
    DELETE: makePermission('legal_documents', 'delete', 'Delete legal documents'),
    MANAGE: makePermission('legal_documents', 'manage', 'Manage legal documents'),
  },

  // RBAC (access control screens)
  RBAC: {
    VIEW: makePermission('rbac', 'view', 'View roles and permissions'),
    MANAGE: makePermission('rbac', 'manage', 'Manage roles, permissions and assignments'),
  },

  // CRM — Contacts
  CRM_CONTACTS: {
    VIEW: makePermission('crm.contacts', 'view', 'View CRM contacts'),
    CREATE: makePermission('crm.contacts', 'create', 'Create CRM contacts'),
    UPDATE: makePermission('crm.contacts', 'update', 'Update CRM contacts'),
    DELETE: makePermission('crm.contacts', 'delete', 'Delete CRM contacts'),
    IMPORT: makePermission('crm.contacts', 'import', 'Import CRM contacts'),
    MANAGE: makePermission('crm.contacts', 'manage', 'Manage all CRM contacts'),
  },

  // CRM — Leads
  CRM_LEADS: {
    VIEW: makePermission('crm.leads', 'view', 'View CRM leads'),
    CREATE: makePermission('crm.leads', 'create', 'Create CRM leads'),
    UPDATE: makePermission('crm.leads', 'update', 'Update CRM leads'),
    DELETE: makePermission('crm.leads', 'delete', 'Delete CRM leads'),
    ASSIGN: makePermission('crm.leads', 'assign', 'Assign CRM leads to users'),
    MANAGE: makePermission('crm.leads', 'manage', 'Manage all CRM leads'),
  },

  // CRM — Lead stages
  CRM_LEAD_STAGES: {
    VIEW: makePermission('crm.lead_stages', 'view', 'View lead stages'),
    CREATE: makePermission('crm.lead_stages', 'create', 'Create lead stages'),
    UPDATE: makePermission('crm.lead_stages', 'update', 'Update lead stages'),
    DELETE: makePermission('crm.lead_stages', 'delete', 'Delete lead stages'),
    MANAGE: makePermission('crm.lead_stages', 'manage', 'Manage lead stages'),
  },

  // CRM — Directory listings
  CRM_DIRECTORY_LISTINGS: {
    VIEW: makePermission('crm.directory_listings', 'view', 'View directory listings'),
    CREATE: makePermission('crm.directory_listings', 'create', 'Create directory listings'),
    UPDATE: makePermission('crm.directory_listings', 'update', 'Update directory listings'),
    DELETE: makePermission('crm.directory_listings', 'delete', 'Delete directory listings'),
    MANAGE: makePermission('crm.directory_listings', 'manage', 'Manage directory listings'),
  },

  // CRM — Site visits
  CRM_SITE_VISITS: {
    VIEW: makePermission('crm.site_visits', 'view', 'View site visits'),
    CREATE: makePermission('crm.site_visits', 'create', 'Create site visits'),
    UPDATE: makePermission('crm.site_visits', 'update', 'Update site visits'),
    DELETE: makePermission('crm.site_visits', 'delete', 'Delete site visits'),
    MANAGE: makePermission('crm.site_visits', 'manage', 'Manage site visits'),
  },

  // CRM — Subscribers
  CRM_SUBSCRIBERS: {
    VIEW: makePermission('crm.subscribers', 'view', 'View subscribers'),
    CREATE: makePermission('crm.subscribers', 'create', 'Create subscribers'),
    UPDATE: makePermission('crm.subscribers', 'update', 'Update subscribers'),
    DELETE: makePermission('crm.subscribers', 'delete', 'Delete subscribers'),
    MANAGE: makePermission('crm.subscribers', 'manage', 'Manage subscribers'),
  },

  // CRM — Google leads
  CRM_GOOGLE_LEADS: {
    VIEW: makePermission('crm.google_leads', 'view', 'View Google leads'),
    CREATE: makePermission('crm.google_leads', 'create', 'Create Google leads'),
    UPDATE: makePermission('crm.google_leads', 'update', 'Update Google leads'),
    DELETE: makePermission('crm.google_leads', 'delete', 'Delete Google leads'),
    MANAGE: makePermission('crm.google_leads', 'manage', 'Manage Google leads'),
  },

  // Messages & templates
  MESSAGE_TEMPLATES: {
    VIEW: makePermission('message_templates', 'view', 'View message templates'),
    CREATE: makePermission('message_templates', 'create', 'Create message templates'),
    UPDATE: makePermission('message_templates', 'update', 'Update message templates'),
    DELETE: makePermission('message_templates', 'delete', 'Delete message templates'),
    MANAGE: makePermission('message_templates', 'manage', 'Manage message templates'),
  },

  MESSAGES: {
    VIEW: makePermission('messages', 'view', 'View message outbox'),
    SEND: makePermission('messages', 'send', 'Send messages'),
    MANAGE: makePermission('messages', 'manage', 'Manage all messages'),
  },

  // App settings & activity logs
  APP_SETTINGS: {
    VIEW: makePermission('app_settings', 'view', 'View app settings'),
    UPDATE: makePermission('app_settings', 'update', 'Update app settings'),
    MANAGE: makePermission('app_settings', 'manage', 'Manage app settings'),
  },

  ACTIVITY_LOGS: {
    VIEW: makePermission('activity_logs', 'view', 'View activity logs'),
    MANAGE: makePermission('activity_logs', 'manage', 'Manage activity logs'),
  },

  // Users
  USERS: {
    VIEW: makePermission('users', 'view', 'View admin users'),
    CREATE: makePermission('users', 'create', 'Create admin users'),
    UPDATE: makePermission('users', 'update', 'Update admin users'),
    DELETE: makePermission('users', 'delete', 'Delete admin users'),
    MANAGE: makePermission('users', 'manage', 'Manage admin users'),
  },
} as const;

export const ALL_PERMISSION_KEYS: string[] = Object.values(ADMIN_PERMISSIONS)
  .flatMap((group) => Object.values(group).map((p) => buildPermissionKey(p.resource, p.action)));

export const ALL_PERMISSIONS: PermissionDefinition[] = Object.values(ADMIN_PERMISSIONS)
  .flatMap((group) => Object.values(group));

/**
 * Default role permission matrix.
 * SUPER_ADMIN gets everything. Other roles get a curated subset.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSION_KEYS],

  SALES_MANAGER: [
    buildPermissionKey('dashboard', 'view'),
    buildPermissionKey('crm.contacts', 'view'),
    buildPermissionKey('crm.contacts', 'create'),
    buildPermissionKey('crm.contacts', 'update'),
    buildPermissionKey('crm.contacts', 'delete'),
    buildPermissionKey('crm.contacts', 'import'),
    buildPermissionKey('crm.leads', 'view'),
    buildPermissionKey('crm.leads', 'create'),
    buildPermissionKey('crm.leads', 'update'),
    buildPermissionKey('crm.leads', 'delete'),
    buildPermissionKey('crm.leads', 'assign'),
    buildPermissionKey('crm.lead_stages', 'view'),
    buildPermissionKey('crm.directory_listings', 'view'),
    buildPermissionKey('crm.site_visits', 'view'),
    buildPermissionKey('crm.site_visits', 'create'),
    buildPermissionKey('crm.subscribers', 'view'),
    buildPermissionKey('crm.google_leads', 'view'),
    buildPermissionKey('messages', 'view'),
    buildPermissionKey('messages', 'send'),
  ],

  SALES_REP: [
    buildPermissionKey('dashboard', 'view'),
    buildPermissionKey('crm.contacts', 'view'),
    buildPermissionKey('crm.contacts', 'create'),
    buildPermissionKey('crm.contacts', 'update'),
    buildPermissionKey('crm.leads', 'view'),
    buildPermissionKey('crm.leads', 'create'),
    buildPermissionKey('crm.leads', 'update'),
    buildPermissionKey('crm.site_visits', 'view'),
    buildPermissionKey('crm.site_visits', 'create'),
    buildPermissionKey('messages', 'view'),
    buildPermissionKey('messages', 'send'),
  ],

  PARTNER_ADMIN: [
    buildPermissionKey('dashboard', 'view'),
    buildPermissionKey('crm.contacts', 'view'),
    buildPermissionKey('crm.contacts', 'create'),
    buildPermissionKey('crm.contacts', 'update'),
    buildPermissionKey('crm.leads', 'view'),
    buildPermissionKey('crm.leads', 'create'),
    buildPermissionKey('crm.leads', 'update'),
    buildPermissionKey('crm.leads', 'assign'),
    buildPermissionKey('crm.site_visits', 'view'),
    buildPermissionKey('crm.site_visits', 'create'),
    buildPermissionKey('messages', 'view'),
    buildPermissionKey('messages', 'send'),
  ],

  PARTNER_AGENT: [
    buildPermissionKey('dashboard', 'view'),
    buildPermissionKey('crm.contacts', 'view'),
    buildPermissionKey('crm.leads', 'view'),
    buildPermissionKey('crm.leads', 'create'),
    buildPermissionKey('crm.leads', 'update'),
    buildPermissionKey('crm.site_visits', 'view'),
    buildPermissionKey('crm.site_visits', 'create'),
    buildPermissionKey('messages', 'view'),
    buildPermissionKey('messages', 'send'),
  ],
};

export const DEFAULT_ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Full access to everything including CRM',
  SALES_MANAGER: 'Manage all leads, assign reps, view dashboard',
  SALES_REP: 'Manage assigned leads, log activities, schedule visits',
  PARTNER_ADMIN: 'Manage own org leads and agents only',
  PARTNER_AGENT: 'Manage own assigned leads only',
};
