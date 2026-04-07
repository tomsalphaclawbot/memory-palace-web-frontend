# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project currently tracks changes on `main` until a first tagged release.

## [Unreleased]

### Added
- Open-source governance files: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY.
- GitHub issue and PR templates.
- CI workflow for basic integrity checks.
- `/healthz` endpoint.

### Changed
- Docker and runtime configuration generalized for public re-use.
- Removed hardcoded local paths and cloudflared IDs from tracked config.
- Improved request validation for pagination params.
