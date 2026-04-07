# AGENTS.md

Project-level instructions for AI/code agents working in this repository.

## Scope
- Project: `memory-palace-web-frontend`
- Goal: read-only web UI + API for browsing MemPalace SQLite stores.

## Hard constraints
- Never write to palace SQLite data.
- Preserve read-only DB access (`mode=ro`).
- Do not add broad filesystem mounts by default.
- Do not commit secrets (`.env`, tokens, credentials files).

## Product defaults
- Local + Docker workflows are first-class.
- Optional Cloudflare tunnel support may exist, but must remain optional.
- Keep setup simple for self-hosters.
- Palace target is config-file-driven (`config/palace.json`), not runtime UI input.

## Files to keep aligned when behavior changes
- `README.md`
- `CHANGELOG.md`
- `TODO.md`
- `.env.example`
- `docker-compose.yml`
- `scripts/*.sh`

## Local validation before commit
1. Python syntax check:
   ```bash
   ./.venv/bin/python -m compileall app.py scripts
   ```
2. Compose validation:
   ```bash
   PALACE_PATH=./palace docker compose config
   ```
3. If API behavior changes, verify endpoints manually:
   - `/api/summary`
   - `/api/wings`
   - `/api/rooms`
   - `/api/drawers`
   - `/api/drawer/<embedding_id>`

## Coding style
- Prefer small, targeted diffs.
- Keep error messages actionable.
- Preserve backwards compatibility unless product direction explicitly removes a path.

## Commit style
- Use concise imperative commit messages.
- Include docs updates in same PR/commit when changing behavior.
