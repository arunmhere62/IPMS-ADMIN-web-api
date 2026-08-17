# Enterprise RBAC Architecture — IPMS-ADMIN-web

## Overview

This document describes the role-based access control (RBAC) architecture for the
IPMS admin web application. It is designed for enterprise use: permissions are
enforced at the API layer, encoded in the JWT, and reflected in the UI.

## Core principles

1. **Single permission catalog** — every action in the app is represented as a
   `resource:action` key (e.g. `crm.leads:view`). The catalog is the same on the
   backend and frontend.
2. **JWT as the source of truth at runtime** — when a user logs in, the backend
   resolves their effective permissions and embeds them in the JWT. Guards and
   UI both read from this claim, avoiding repeated DB round trips per request.
3. **Defense in depth** — route guards (backend), menu filtering (sidebar), and
   page-level UI guards all enforce permissions. The backend is the ultimate
   authority.
4. **Role-based defaults with user overrides** — permissions are granted by role.
   Individual users can have additive or revocable overrides for fine-grained
   control.

## Data model (management DB)

```prisma
model role { ... role_permission[] ... }
model permission { ... resource, action ... }
model role_permission { role_id, permission_id }
model user_permission_override { user_id, permission_id, granted }
```

- `permission` — the catalog of all possible actions (e.g. `crm.leads:view`).
- `role_permission` — many-to-many mapping of roles to permissions.
- `user_permission_override` — user-level exceptions (`granted=true` adds,
  `granted=false` removes a permission from the user's role baseline).

## Default roles

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Full access to everything including CRM |
| `SALES_MANAGER` | Manage all leads, assign reps, view dashboard |
| `SALES_REP` | Manage assigned leads, log activities, schedule visits |
| `PARTNER_ADMIN` | Manage own org leads and agents only |
| `PARTNER_AGENT` | Manage own assigned leads only |

Roles and their default permissions are auto-seeded on every startup via
`RbacService.seedRolesAndAssignments()`.

## Permission catalog

Permissions are grouped by business domain. The full list is in:

- Backend: `src/common/rbac/permissions.catalog.ts`
- Frontend: `src/lib/permissions.ts`

Key groups:
- `dashboard:view`
- `tickets:view|create|update|delete|manage`
- `organizations:view|create|update|delete|manage`
- `subscription_plans:view|create|update|delete|manage`
- `legal_documents:view|create|update|delete|manage`
- `rbac:view|manage`
- `crm.contacts:view|create|update|delete|import|manage`
- `crm.leads:view|create|update|delete|assign|manage`
- `crm.lead_stages:view|create|update|delete|manage`
- `crm.directory_listings:view|create|update|delete|manage`
- `crm.site_visits:view|create|update|delete|manage`
- `crm.subscribers:view|create|update|delete|manage`
- `crm.google_leads:view|create|update|delete|manage`
- `message_templates:view|create|update|delete|manage`
- `messages:view|send|manage`
- `app_settings:view|update|manage`
- `activity_logs:view|manage`
- `users:view|create|update|delete|manage`

## Backend enforcement

### Global guards

`RbacModule` registers two global guards via NestJS `APP_GUARD`:

1. `JwtAuthGuard` — validates the `Authorization: Bearer <token>` header on every
   non-public route and attaches `req.user`.
2. `PermissionsGuard` — checks `@RequirePermission(...)` metadata and rejects
   requests missing the required permissions.

### Public routes

Use `@Public()` on auth endpoints, health checks, and webhooks:

```typescript
import { Public } from './common/decorators/public.decorator';

@Controller('auth')
@Public()
export class AuthController { ... }
```

### Declaring permissions on endpoints

```typescript
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@Get()
@RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.VIEW))
async listLeads() { ... }

@Post()
@RequirePermission(permissionKey(ADMIN_PERMISSIONS.CRM_LEADS.CREATE))
async createLead() { ... }
```

Require **any** of several permissions:

```typescript
@RequirePermission({ permissions: ['crm.leads:view', 'crm.contacts:view'], mode: 'any' })
```

### Admin RBAC management API

New endpoints under `/rbac` (management DB) let super-admins manage the system:

- `GET /rbac/permissions/me` — current user's effective permissions
- `GET /rbac/permissions` — full catalog
- `GET /rbac/roles/:roleId/permissions` — role permissions
- `POST /rbac/roles/:roleId/permissions` — set role permissions (replace all)
- `POST /rbac/users/:userId/permissions/:key` — grant/revoke user override
- `DELETE /rbac/users/:userId/permissions/:key` — remove user override

These require `rbac:view` and `rbac:manage` respectively.

## Frontend enforcement

### Auth context

`AuthProvider` wraps the app and exposes the current user, permissions, and
helpers:

```tsx
import { useAuth } from '@/context/auth-context';

const { user, hasPermission, hasAnyPermission, hasAllPermissions, logout } = useAuth();
```

Permissions are read from the JWT payload and persisted in `localStorage` under
`auth_user` so the UI survives reloads.

### UI guards

```tsx
import { PermissionGuard, Can } from '@/components/permission-guard';

<Can permission='crm.leads:create'>
  <Button>Create Lead</Button>
</Can>

<PermissionGuard permissions={['crm.leads:view', 'crm.leads:create']} mode='any'>
  <Button>Show if any</Button>
</PermissionGuard>
```

### Route guards

```tsx
import { RoutePermissionGuard } from '@/components/route-permission-guard';

<Route
  path='/crm/leads'
  element={
    <RoutePermissionGuard permission='crm.leads:view'>
      <LeadsListScreen />
    </RoutePermissionGuard>
  }
/>
```

### Sidebar filtering

Each sidebar item now declares a `permission`. `AppSidebar` filters out items the
user cannot see. Empty groups are hidden automatically.

## Login flow

1. User verifies OTP.
2. `AuthService` resolves the user's role permissions + overrides from the
   management DB.
3. JWT is signed with `{ sub, role, permissions: [...], organization_id }`.
4. Frontend stores token in `access_token` cookie and user object (with
   permissions) in `localStorage` + `AuthContext`.

## Migration / deployment notes

1. Apply the Prisma schema migration to the management database:
   ```bash
   npm run prisma:migrate:management
   ```
2. Restart the API. `RbacModule.onModuleInit()` seeds permissions and roles
   automatically.
3. Existing users will receive permissions on their next login (JWT refresh).
4. Existing management DB roles are preserved and updated with descriptions.

## Security notes

- The JWT secret must be strong and rotated periodically.
- Token expiry is controlled by `WEB_AUTH_JWT_EXPIRES_IN` (default 24h).
- Never trust the `x-user-id` header alone; `JwtAuthGuard` validates the JWT and
  sets `req.user`.
- All permission mutations (`rbac:manage`) should be restricted to
  `SUPER_ADMIN` or trusted administrators.

## Adding a new permission

1. Add it to both catalogs:
   - `src/common/rbac/permissions.catalog.ts`
   - `src/lib/permissions.ts`
2. Apply it to backend endpoints with `@RequirePermission(...)`.
3. Apply it to frontend routes/sidebar/buttons with `RoutePermissionGuard` / `Can`.
4. Optionally add it to `DEFAULT_ROLE_PERMISSIONS` for auto-seeding.
5. Deploy and restart the API to seed the new permission.
