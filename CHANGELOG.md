# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0] - 2026-04-07

### Added
- Public launch baseline for the open-source Memory Palace Web Frontend.
- Multi-view shell with Browser, 3D View, and Graph View tabs.
- Graph renderers: Cytoscape, vis-network, D3 Force, and ForceGraph.
- Neo4j graph renderer mode and live Bolt-backed endpoints:
  - `/api/graph_neo4`
  - `/api/graph_neo4_status`
- Optional Neo4j runtime config (`NEO4J_ENABLED`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`).
- Docker live-reload development flow with mounted frontend sources.

### Changed
- Refreshed UI shell and navigation layout for desktop and mobile.
- Improved graph interaction UX and compact iOS portrait navigation behavior.
- Removed runtime palace-path controls from UI (including `/settings`) and switched to config-file-only targeting.
- Summary UI/API no longer expose SQLite file path.
- Added `config/palace.json` as the canonical palace source.
- Static asset cache-busting support for faster frontend iteration.

## [0.1.0] - 2026-04-07

### Added
- Open-source governance files: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY.
- GitHub issue and PR templates.
- CI workflow for basic integrity checks.
- `/healthz` endpoint.

### Changed
- Docker and runtime configuration generalized for public re-use.
- Removed hardcoded local paths and cloudflared IDs from tracked config.
- Improved request validation for pagination params.
- Removed deployment-specific references from public docs.
- Updated default local mount/path examples to use `./palace`.
