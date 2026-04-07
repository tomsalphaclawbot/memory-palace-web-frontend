# memory-palace-web-frontend

Web UI for browsing a MemPalace store live.

## What it does

- Point at any `chroma.sqlite3`-backed memory palace
- Browse by wing and room
- Search drawer text
- Open full drawer content
- Paginated live view of drawers
- Deploy behind Cloudflare Tunnel on its own subdomain

## Local run (non-Docker)

```bash
cd projects/memory-palace-web-frontend
./scripts/run.sh
```

Open: `http://127.0.0.1:8099`

## Docker run (recommended)

```bash
cd projects/memory-palace-web-frontend
./scripts/docker-up.sh
```

This starts:
- `memory-palace-web-frontend` (Flask/Gunicorn)
- `cloudflared-memory-palace-web-frontend` (Cloudflare Tunnel)

Endpoints:
- Local: `http://127.0.0.1:8099`
- Public (tunnel): `https://memory-palace.tomsalphaclawbot.work`

Stop stack:

```bash
./scripts/docker-down.sh
```

Logs:

```bash
./scripts/docker-logs.sh
```

## SQLite mount model in Docker

Yes, the app runs in Docker and reads SQLite via bind mount.

Least-privilege default: only one palace path is mounted read-only.

Default mounted path:

`/Users/openclaw/.openclaw/workspace/projects/alpha-mem-palace/data/palace`

No full home-directory mount is used.

## Point to a different palace

Set `PALACE_PATH` when launching (this controls both mount and default runtime path):

```bash
PALACE_PATH=/Users/openclaw/path/to/another/palace ./scripts/docker-up.sh
```

or, if that path is already mounted, override per API request with query param:

`?palace=/Users/openclaw/path/to/palace`

Path resolution supports:
- direct sqlite file path
- `<path>/chroma.sqlite3`
- `<path>/data/palace/chroma.sqlite3`
- `<path>/palace/chroma.sqlite3`

## API

- `GET /api/config`
- `GET /api/summary`
- `GET /api/wings`
- `GET /api/rooms?wing=<name>`
- `GET /api/drawers?wing=&room=&q=&limit=&offset=`
- `GET /api/drawer/<embedding_id>`

All APIs accept optional `?palace=/path/to/palace`.
