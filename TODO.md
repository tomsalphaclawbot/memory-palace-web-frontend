# TODO

## P0 (next)
- [ ] Build a multi-view frontend shell with a mode switcher:
  - [x] List (current)
  - [x] 3D Palace (tab scaffold)
  - [x] Knowledge Graph (tab scaffold)
  - [ ] Timeline
- [x] Add dedicated settings page (`/settings`) for path validation + launch into browser.
- [ ] Research + choose 3D stack (Three.js/R3F vs `react-force-graph-3d`).
- [ ] Research + choose graph stack (Cytoscape.js vs Sigma.js vs AntV G6).
- [ ] Implement 3D Palace v0 prototype.
- [ ] Implement Knowledge Graph v0 prototype.
- [ ] Add automated API smoke tests for:
  - [ ] `/api/summary`
  - [ ] `/api/wings`
  - [ ] `/api/rooms`
  - [ ] `/api/drawers`
  - [ ] `/api/drawer/<embedding_id>`

## P1
- [ ] Add interaction polish: hover cards, focus, pin, filter, smooth camera transitions.
- [ ] Add saved search presets in the UI.
- [ ] Add CSV export for filtered drawer results.
- [ ] Add JSON export for filtered drawer results.
- [ ] Add wing/room analytics summary cards.
- [ ] Add UI empty/error/loading states polish pass.

## P2
- [ ] Add optional auth integration patterns for self-hosted installs.
- [ ] Add performance tuning guide for large palaces.
- [ ] Add screenshots/GIF demo to README.
- [ ] Tag first release (`v0.1.0`) and add release notes from `CHANGELOG.md`.

## Other view ideas
- [ ] Constellation view (wing clusters with room orbits)
- [ ] Journey/path view (narrative traversal)
- [ ] Heatmap view (room/source density)

## Notes
- Keep data access read-only.
- Keep Docker mounts minimal and explicit.
- Tunnel support stays optional.
