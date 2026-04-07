# Memory Palace Web Frontend

A lightweight, read-only web UI and JSON API for browsing a MemPalace SQLite store.

## Related projects

- Upstream MemPalace: <https://github.com/milla-jovovich/mempalace>

## Version

- Current version: `0.1.0` (see [`VERSION`](./VERSION))
- Version history log: [CHANGELOG.md](./CHANGELOG.md)

## Quick start guide

### Option A: Local run

1. Copy env template:

```bash
cp .env.example .env
```

2. Set `MEMORY_PALACE_PATH` in `.env` (palace dir or `chroma.sqlite3` file).
3. Install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

4. Start app:

```bash
./scripts/run.sh
```

5. Open <http://127.0.0.1:8099>

### Option B: Docker run

1. Copy env template:

```bash
cp .env.example .env
```

2. (Optional) set `PALACE_PATH` in `.env` (defaults to `./palace`).
3. Start:

```bash
./scripts/docker-up.sh
```

4. Open <http://127.0.0.1:8099>

## Features

- Read-only API over `chroma.sqlite3`
- Top tabs for Browser, 3D View, Graph View, and Settings
- Wing and room navigation
- Drawer search and pagination
- Drawer detail view
- Dedicated `/settings` page for session-only palace path validation/launch
- Works with a direct SQLite file path or palace root path
- Optional Cloudflare Tunnel sidecar for Access-gated publishing

## API

All endpoints support optional `?palace=/path/to/palace-or-sqlite`.

- `GET /api/config`
- `GET /api/summary`
- `GET /api/wings`
- `GET /api/rooms?wing=<name>`
- `GET /api/drawers?wing=&room=&q=&limit=&offset=`
- `GET /api/drawer/<embedding_id>`
- `GET /healthz`

## Docker details

```bash
cp .env.example .env
# optionally set PALACE_PATH (defaults to ./palace)
./scripts/docker-up.sh
```

- App runs on `http://127.0.0.1:${PORT:-8099}` (bound to `${BIND_HOST:-127.0.0.1}`)
- The container mounts only `PALACE_PATH` as read-only at `/palace`

### Optional Cloudflare Tunnel

If `CLOUDFLARED_TUNNEL_TOKEN` is set, `scripts/docker-up.sh` also starts cloudflared using the `tunnel` profile.

Stop:

```bash
./scripts/docker-down.sh
```

Logs:

```bash
./scripts/docker-logs.sh
```

## Security model

- Read-only SQLite connection (`mode=ro`)
- Least-privilege Docker mount (single explicit palace path)
- Cloudflare exposure is optional and intended to be protected by Cloudflare Access
- No secrets should be committed to this repository

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Wishlist / Coming soon

- Saved search presets in the UI
- Wing and room analytics dashboard
- Export views (JSON/CSV) for filtered result sets
- Optional auth provider integrations for self-hosted installs
- Better large-palace performance with indexed search tuning

## License

MIT (see [LICENSE](./LICENSE)).
