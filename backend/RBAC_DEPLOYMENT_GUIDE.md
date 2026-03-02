# RBAC Deployment Guide (RBAC + TBAC + Multi-tenant)

This guide captures the production model for:

- Role-based functional access
- Team-based data visibility
- Tenant isolation
- Backend-enforced authorization

## 1. Access Model

- `USER`:
  - Portal access only
  - Own tickets only
  - No ITSM internal modules
- `AGENT`:
  - Portal + limited ITSM
  - Team + assigned ticket visibility
  - Allowed ITSM tabs: Dashboard, Tickets, Assets, Users, Suppliers, Accounts
- `ADMIN`:
  - Full access across tenant
  - User/role/team/permission management
  - Visibility override

## 2. Data Model

Use the reference SQL:

- [rbac_multitenant_reference.sql](c:/Users/girim/Desktop/ITSM/backend/schema/rbac_multitenant_reference.sql)

Core entities:

- `tenants`
- `users`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `teams`
- `team_members`
- `tickets`

## 3. Authorization Middleware (API)

```ts
function authorize(requiredPermission: string) {
  return async (req, res, next) => {
    const user = await authenticateJWT(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const permissions = await getUserPermissions(user.id, user.tenant_id)
    if (!permissions.includes(requiredPermission)) {
      auditLog('access_denied', { user_id: user.id, permission: requiredPermission, path: req.path })
      return res.status(403).json({ error: 'Forbidden' })
    }
    return next()
  }
}
```

## 4. Ticket Visibility Enforcement (Service Layer)

```ts
function canViewTicket(ticket, userCtx) {
  if (userCtx.permissions.has('ticket.view.all')) return true
  if (userCtx.permissions.has('ticket.view.team') && userCtx.teamIds.has(ticket.team_id)) return true
  if (userCtx.permissions.has('ticket.view.own') && ticket.created_by === userCtx.user_id) return true
  return false
}
```

## 5. DB-Level Ticket Filter (Mandatory)

```sql
SELECT *
FROM tickets
WHERE tenant_id = $1
  AND (
    assigned_to = $2
    OR team_id = ANY($3::bigint[])
  );
```

## 6. Microservices RBAC Pattern

Recommended flow:

1. Client -> API Gateway
2. API Gateway -> Auth validation (JWT)
3. Gateway/service -> Policy evaluation (local or central)
4. Business service executes only if `ALLOW`

Two patterns:

- Embedded claims in JWT:
  - `user_id`, `tenant_id`, `roles`, `permissions`, `team_ids`
- Central policy service (OPA/custom):
  - Services call policy endpoint with `{ user, action, resource, tenant }`

## 7. Multi-tenant Design Rules

- Every business table must include `tenant_id`.
- Every query must include tenant filter.
- Role assignments are tenant-scoped.
- No cross-tenant data joins without explicit platform-admin policy.

Optional SaaS super-admin:

- `is_platform_admin = true` can manage tenants
- Ticket/data read still blocked unless explicit break-glass authorization

## 8. Security Review Checklist

Access control:

- Backend permission checks for all endpoints
- Direct API access tests
- IDOR and privilege escalation tests

Token security:

- Short-lived access tokens
- Refresh rotation/revocation
- Strong signing key and secure secret storage

Database security:

- Tenant filtering on all reads/writes
- Indexed `tenant_id`, `team_id`, `assigned_to`
- Parameterized queries only

Audit logging:

- Login attempts
- Authorization failures
- Role/permission/team assignment changes
- Admin overrides

Infrastructure:

- HTTPS enforced
- Strict CORS
- Rate limiting
- WAF/CDN controls

Pen test:

- OWASP Top 10
- Broken Access Control
- Cross-tenant access checks

## 9. Current Project Integration Notes

The current codebase already enforces:

- Role permission middleware for major API routes
- Team/assignee scoped ticket access in ticket service
- Audit logs for denied access attempts

Remaining enterprise hardening:

- Full `tenant_id` rollout across all module queries and tables
- JWT claim expansion (`tenant_id`, `permissions`, `team_ids`)
- Optional centralized policy engine for microservices
