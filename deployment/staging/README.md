# Disposable Zuno Pixel staging wrapper

This wrapper runs Zuno Pixel beside SiteForge without changing either
application. It uses the Compose project `zunopixel-staging`, project-scoped
networks and project-scoped volumes. The only host port it publishes is the
Zuno Pixel web port at `127.0.0.1:3100`.

Zuno Pixel is a single Vinext application: its `/api` routes run in the web
process. There is no separate API container and therefore no host mapping on
`127.0.0.1:8100`. The native container port remains `3000`.

PostgreSQL is a dedicated staging service on an internal Docker network and
publishes no host port. A one-shot `migrate` service applies the independently
owned PostgreSQL lineage before the web container can start. Redis was removed
because Zuno Pixel has no justified Redis use.

## Server layout

Copy the checked-out repository and the wrapper to this layout:

```text
/opt/zunopixel/
├── app/                         # Zuno Pixel repository checkout
└── staging/
    ├── .env.staging             # server-only secrets; never commit
    ├── Dockerfile.web
    ├── docker-compose.staging.yml
    └── nginx/
        └── zunopixel-staging.conf
```

For example, from the repository root on the server:

```bash
sudo install -d -m 0750 /opt/zunopixel/staging/nginx
sudo cp deployment/staging/Dockerfile.web /opt/zunopixel/staging/
sudo cp deployment/staging/docker-compose.staging.yml /opt/zunopixel/staging/
sudo cp deployment/staging/nginx/zunopixel-staging.conf /opt/zunopixel/staging/nginx/
sudo cp deployment/staging/.env.staging.example /opt/zunopixel/staging/.env.staging
sudo chmod 0600 /opt/zunopixel/staging/.env.staging
sudoedit /opt/zunopixel/staging/.env.staging
```

Replace the example database password in both `POSTGRES_PASSWORD` and the
URL-encoded password segment of `DATABASE_URL`. Configure an OIDC client whose
callback is `https://staging.zunopixel.com.au/auth/callback`, generate a fresh
32-byte base64url session secret, set the public staging URL and add only the
integration secrets needed for the rehearsal. Keep `.env.staging` outside the
Git checkout and never commit it. Compose fails before startup when required
database or identity configuration is missing.

All commands below operate only on the `zunopixel-staging` Compose project:

```bash
cd /opt/zunopixel/staging
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml up -d --build
```

Confirm the bound port and container health:

```bash
curl --fail --show-error http://127.0.0.1:3100/
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml ps
```

## Day-to-day commands

Stop Zuno Pixel staging without removing its containers:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml stop
```

Start existing staging containers:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml start
```

View all staging logs, or only the Zuno Pixel log:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml logs --follow --tail 200
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml logs --follow --tail 200 web
```

Restart only Zuno Pixel, leaving PostgreSQL untouched:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml restart web
```

Rebuild and replace only the Zuno Pixel container after a code-only update:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml up -d --build --no-deps web
```

After any update that may add a PostgreSQL migration, run the normal full
`up -d --build` command. The migration ledger verifies checksums, applies each
new migration in a transaction, and prevents web readiness if migration fails.

## First standalone administrator

Complete one OIDC login first so the operator knows the provider's stable
subject and verified email, then run the one-time bootstrap inside the web
image. Values are supplied through the process environment rather than command
arguments so identity data is not exposed in the process list:

```bash
cd /opt/zunopixel/staging
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml run --rm \
  -e BOOTSTRAP_IDENTITY_PROVIDER=company-oidc \
  -e BOOTSTRAP_EXTERNAL_SUBJECT='provider-subject' \
  -e BOOTSTRAP_EMAIL='admin@example.com' \
  -e BOOTSTRAP_DISPLAY_NAME='Initial Administrator' \
  web npm run admin:bootstrap
```

The command calls `BootstrapFirstAdminService`, records immutable audit
evidence, prints no credential material and is rejected after the first admin
exists. The provider ID must exactly match `OIDC_PROVIDER_ID`.

## PostgreSQL backup and restore

Create an application-consistent logical backup without publishing PostgreSQL:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml exec -T postgres \
  sh -c 'pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' > zunopixel-staging.dump
```

Restore only into an empty, stopped rehearsal environment after preserving the
current volume. Start PostgreSQL alone, copy the dump into the container and
use `pg_restore --clean --if-exists`; then run `migrate` and start `web`. Never
restore over a running application.

## Optional nginx staging hostname

The supplied file is a separate virtual host for
`staging.zunopixel.com.au`. Point that hostname at the server and install only
this new file; do not edit `/etc/nginx/sites-enabled/siteforge`.

```bash
sudo install -m 0644 /opt/zunopixel/staging/nginx/zunopixel-staging.conf /etc/nginx/sites-available/zunopixel-staging.conf
sudo ln -s /etc/nginx/sites-available/zunopixel-staging.conf /etc/nginx/sites-enabled/zunopixel-staging.conf
sudo nginx -t
```

Reload nginx only if `nginx -t` succeeds:

```bash
sudo systemctl reload nginx
```

Add the server's normal TLS configuration before treating the hostname as
public. When TLS terminates at nginx, set `NEXT_PUBLIC_SITE_URL` in the private
staging environment to the corresponding `https://` URL and rebuild `web`.

To remove the optional route, remove only the Zuno Pixel staging symlink and
file, validate the remaining configuration, and reload after validation:

```bash
sudo unlink /etc/nginx/sites-enabled/zunopixel-staging.conf
sudo rm /etc/nginx/sites-available/zunopixel-staging.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Disposal and data retention

Remove staging containers and its project networks while preserving all named
volumes, including PostgreSQL data:

```bash
cd /opt/zunopixel/staging
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml down --remove-orphans
```

After that command, the wrapper itself can be removed without changing the app
checkout or SiteForge:

```bash
sudo rm -rf /opt/zunopixel/staging
```

Named volumes are deliberately retained by the default removal command. List
the retained volumes with:

```bash
docker volume ls --filter label=com.docker.compose.project=zunopixel-staging
```

Only when a full data purge has been explicitly approved, run this instead of
the preserving `down` command:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml down --remove-orphans --volumes
```

None of these commands address SiteForge services, its Compose project, its
nginx virtual host, its network or its volumes.
