# Memory Palace Web Frontend

A lightweight, read-only web UI and JSON API for browsing a MemPalace SQLite store.

## Related projects

- Upstream MemPalace: <https://github.com/milla-jovovich/mempalace>

## Features

- Read-only API over `chroma.sqlite3`
- Wing and room navigation
- Drawer search and pagination
- Drawer detail view
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

## Quick start (local)

```bash
cp .env.example .env
# set MEMORY_PALACE_PATH to your palace path or chroma.sqlite3
./scripts/run.sh
```

Open <http://127.0.0.1:8099>

## Docker

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

## License

MIT (see [LICENSE](./LICENSE)).
