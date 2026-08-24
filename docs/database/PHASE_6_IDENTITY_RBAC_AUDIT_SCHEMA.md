# Phase 6 identity, RBAC and audit schema

Migration: `site/drizzle/0004_bored_red_ghost.sql`.

## Added tables

| Table | Purpose | Important enforcement |
| --- | --- | --- |
| `admin_users` | External administrator identity and lifecycle | unique provider/subject and email; active/suspended check; partial unique one-use bootstrap marker; no password/token columns |
| `roles` | Stable named roles | unique uppercase code; five migration-seeded system roles |
| `permissions` | Stable server authorization capabilities | unique uppercase code; 16 migration-seeded permissions |
| `admin_user_roles` | Administrator role assignments | composite primary key; admin/role/assigner foreign keys |
| `role_permissions` | Role capability mappings | composite primary key and role/permission foreign keys |
| `audit_events` | Commercial/security history | actor checks; entity/action/actor/time/request indexes; update/delete rejection triggers |

## Changed table

`customer_identities.accepted_invitation_id` is a nullable foreign key to
`customer_invitations` with a unique index. Existing identities upgrade with
`NULL`; invitation-based identities receive the consumed invitation ID.

## Seeded policy

The migration seeds `SUPER_ADMIN`, `ADMIN`, `SALES`, `SUPPORT` and `READ_ONLY`
plus the initial customer, catalogue, price, discount, subscription, billing,
agent-link, admin-management and audit-read permissions. Role mappings are
inserted from an explicit matrix in the migration and are identical on every
environment.

## Migration evidence

Automated migration tests apply Phases 2–5, preserve an existing customer, then
apply Phase 6. They verify tables/column/seeds, foreign keys and uniqueness,
concurrent bootstrap prevention, one-invitation/one-identity linkage,
append-only triggers and the entity-history query index.
