# Security Policy

## Supported versions

This project is currently pre-1.0 and only the `main` branch is actively supported.

## Reporting a vulnerability

Please do **not** open public issues for vulnerabilities.

Instead:

1. Open a GitHub issue and mark it clearly as `SECURITY` with minimal sensitive detail, or
2. Contact the maintainer directly through known repository contact channels.

Please include:

- Affected endpoint or component
- Reproduction steps
- Impact assessment
- Suggested remediation (if available)

We aim to acknowledge reports quickly and provide a remediation plan after triage.

## Security design notes

- Database access is read-only (`sqlite mode=ro`).
- Docker guidance uses least-privilege single-path bind mounts.
- No secrets should be committed to this repository.
