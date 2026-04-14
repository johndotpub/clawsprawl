# Documentation Index 📚

This directory contains operational, architectural, and extension documentation for the ClawSprawl dashboard.

Last reviewed for release baseline: `v0.42.0`.

## Core Documents

- `technical-design-plan.md` — living architecture spec, active roadmap checklist, and deferred parking lot.
- `operations-runbook.md` — runtime operations, incident triage, and token rotation steps.
- `heredoc-api-sourcecode.md` — Heredoc conventions and API/sourcecode documentation patterns.
- `extensions.md` — extension surfaces, implementation checklist, and example add-on flow.
- `../CHANGELOG.md` — public release history.
- `../VERSIONING.md` — semantic versioning policy.

## Community and Governance

- `../CONTRIBUTING.md`
- `../CODE_OF_CONDUCT.md`
- `../SECURITY.md`
- `../SUPPORT.md`
- `../AGENTS.md`
- `../LICENSE` — Unlicense (public domain)

## Visual Assets

- `screenshots/` — Playwright-captured documentation images.
  - Includes both public locked and private unlocked dashboard captures.

## Suggested Reading Order

1. `technical-design-plan.md`
2. `operations-runbook.md`
3. `heredoc-api-sourcecode.md`
4. `extensions.md`
5. `../CHANGELOG.md`
6. `../VERSIONING.md`

## Validation Commands

```sh
npm run qa:strict   # unit tests with coverage gates + build
npm run test:e2e    # Playwright browser smoke tests
```

## Release Automation 🤖

- `.github/workflows/publish-gpr.yml` publishes the npm package to GitHub Packages on release tags.
- `.github/workflows/publish-container.yml` publishes the container image to GHCR on release tags.
