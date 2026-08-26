# Standalone OCI runtime operations

## Runtime modes

OpenAI Sites / Cloudflare mode:

```dotenv
DATABASE_RUNTIME=d1
IDENTITY_RUNTIME=siwc
```

The `DB` D1 binding remains declared in `.openai/hosting.json`; Sites injects
the binding and SIWC identity headers. Existing D1 migrations remain in
`site/drizzle/`.

Standalone OCI mode:

```dotenv
DATABASE_RUNTIME=postgres
DATABASE_URL=postgresql://USER:URL_ENCODED_PASSWORD@postgres:5432/DATABASE
DATABASE_POOL_SIZE=10
IDENTITY_RUNTIME=oidc
APP_BASE_URL=https://staging.zunopixel.com.au
OIDC_ISSUER=https://identity.example.com/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_PROVIDER_ID=company-oidc
OIDC_SESSION_SECRET=...
OIDC_SESSION_TTL_SECONDS=28800
```

All selection values are explicit. Unsupported database or identity values,
missing database URLs, missing OIDC settings, and non-HTTPS production origins
fail closed. Generate `OIDC_SESSION_SECRET` from 32 random bytes encoded as
unpadded base64url. Never reuse it between environments or commit it.

Register exactly `${APP_BASE_URL}/auth/callback` with the OIDC provider. The
client must use Authorization Code flow and expose `openid email profile`; the
verified provider subject is the durable external identity. Provider IDs must
remain stable after customers or admins are linked.

## Migration and readiness

From `site/`, apply PostgreSQL migrations before starting the web service:

```bash
npm run postgres:migrate
npm run postgres:ready
npm run start
```

The migrator takes an advisory lock, checks the content hash of every applied
file, and applies pending files transactionally. `postgres:ready` fails when
the database is unavailable or the Phase 18 baseline is absent. The staging
Compose wrapper encodes this order as PostgreSQL health → one-shot migration →
web startup.

## First administrator

Set `BOOTSTRAP_IDENTITY_PROVIDER`, `BOOTSTRAP_EXTERNAL_SUBJECT`,
`BOOTSTRAP_EMAIL` and `BOOTSTRAP_DISPLAY_NAME` for the intended OIDC identity,
then run:

```bash
npm run admin:bootstrap
```

The command is one-time, calls the existing domain service, grants
`SUPER_ADMIN`, records an audit event, refuses use after any administrator
exists and prints no credential material. It is not an HTTP endpoint.

## Customers

An authenticated standalone user whose identity is not linked to a customer
can visit `/register`. Registration creates the customer/business profile and
links that exact provider subject through `RegisterCustomerService`. Admin and
customer authorization remain separate: an OIDC identity gains neither type of
access solely because it authenticated.

## Backup and restore

Use `pg_dump --format=custom` from the private PostgreSQL container or trusted
operations network. Encrypt and retain the backup according to production data
policy. Restore only into an empty, stopped target with `pg_restore`, run
`postgres:migrate`, verify `postgres:ready`, then start web. Never restore over a
live application. The D1 and PostgreSQL backup procedures are independent.

## Switching deployments

Switch hosting mode only through environment configuration and the appropriate
migration command. Do not edit application source, D1 migrations, nginx
identity headers or repository wiring. PostgreSQL must remain Docker-internal;
the disposable wrapper publishes only `127.0.0.1:3100`.
