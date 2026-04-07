# memory-palace-web-frontend

Web UI for browsing a MemPalace store live.

## What it does

- Point at any `chroma.sqlite3`-backed memory palace
- Browse by wing and room
- Search drawer text
- Open full drawer content
- Paginated live view of drawers

## Run

```bash
cd projects/memory-palace-web-frontend
./scripts/run.sh
```

Then open: `http://127.0.0.1:8099`

## Point to a different palace

Set `MEMORY_PALACE_PATH` before starting.

Examples:

```bash
MEMORY_PALACE_PATH=/path/to/palace ./scripts/run.sh
MEMORY_PALACE_PATH=/path/to/chroma.sqlite3 ./scripts/run.sh
```

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

All APIs accept optional `?palace=/path/to/palace` to override the default path per request.
