# Disposable Zuno Pixel staging wrapper

This wrapper runs Zuno Pixel beside SiteForge without changing either
application. It uses the Compose project `zunopixel-staging`, project-scoped
networks and project-scoped volumes. The only host port it publishes is the
Zuno Pixel web port at `127.0.0.1:3100`.

Zuno Pixel is a single Vinext application: its `/api` routes run in the web
process. There is no separate API container and therefore no host mapping on
`127.0.0.1:8100`. The native container port remains `3000`.

PostgreSQL and Redis are dedicated staging services on an internal Docker
network. They publish no host ports. The current application uses Cloudflare
D1, so the wrapper intentionally does not inject PostgreSQL or Redis connection
details into the web service. This preserves the application's runtime
architecture while reserving isolated data services for staging integration
work that may need them later.

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

Replace both example data-service passwords, set the public staging URL and add
only the integration secrets needed for the rehearsal. Keep `.env.staging`
outside the Git checkout when practical and never commit it. The Compose file
fails before startup if either data-service password is missing.

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

Restart only Zuno Pixel, leaving its PostgreSQL and Redis services untouched:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml restart web
```

Rebuild and replace only the Zuno Pixel container after updating the checkout:

```bash
docker compose --project-name zunopixel-staging --env-file .env.staging -f docker-compose.staging.yml up -d --build --no-deps web
```

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
