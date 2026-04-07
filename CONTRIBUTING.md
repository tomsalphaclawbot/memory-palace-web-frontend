# Contributing

Thanks for helping improve Memory Palace Web Frontend.

## Development setup

```bash
git clone https://github.com/tomsalphaclawbot/memory-palace-web-frontend.git
cd memory-palace-web-frontend
cp .env.example .env
# set palace_path in config/palace.json to a real local path
./scripts/run.sh
```

## Pull requests

- Keep PRs focused and small where possible.
- Include a short description of problem, approach, and validation.
- Update docs when API behavior or operator workflow changes.
- For non-trivial behavior changes, include a before/after example.

## Coding expectations

- Maintain read-only semantics for memory-palace data access.
- Avoid adding default broad filesystem mounts.
- Keep error messages clear and actionable.
- Prefer safe defaults over clever behavior.

## Reporting issues

Use GitHub Issues with repro steps and expected vs actual behavior.

For security-sensitive issues, please follow [SECURITY.md](./SECURITY.md).
