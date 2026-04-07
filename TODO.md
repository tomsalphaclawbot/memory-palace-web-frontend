# TODO

## P0 (next)
- [ ] Tag first release (`v0.1.0`) and add release notes from `CHANGELOG.md`.
- [ ] Add automated API smoke tests for:
  - [ ] `/api/summary`
  - [ ] `/api/wings`
  - [ ] `/api/rooms`
  - [ ] `/api/drawers`
  - [ ] `/api/drawer/<embedding_id>`
- [ ] Add UI empty/error/loading states polish pass.

## P1
- [ ] Add saved search presets in the UI.
- [ ] Add CSV export for filtered drawer results.
- [ ] Add JSON export for filtered drawer results.
- [ ] Add wing/room analytics summary cards.

## P2
- [ ] Add optional auth integration patterns for self-hosted installs.
- [ ] Add performance tuning guide for large palaces.
- [ ] Add screenshots/GIF demo to README.

## Notes
- Keep data access read-only.
- Keep Docker mounts minimal and explicit.
- Tunnel support stays optional.
