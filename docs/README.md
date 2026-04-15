# Documentation Index 📚

This directory contains operational, architectural, and extension documentation for the ClawSprawl dashboard.

Last reviewed for release baseline: `v0.42.1`.

## Start Here

- Repository homepage and setup: [`../README.md`](../README.md)
- This docs index: [`README.md`](README.md)
- Screenshot gallery: [`screenshots/README.md`](screenshots/README.md)

## What Goes Where

- [`../README.md`](../README.md): quickstart, architecture overview, deploy modes, and links to deeper docs.
- [`architecture-overview.md`](architecture-overview.md): Mermaid system and sequence diagrams with architecture boundaries.
- [`deployment-guide.md`](deployment-guide.md): canonical setup/deploy/runtime commands, env vars, and release automation.
- [`technical-design-plan.md`](technical-design-plan.md): design intent, architecture decisions, and roadmap-level changes.
- [`operations-runbook.md`](operations-runbook.md): canonical incident response and recovery flow.
- [`heredoc-api-sourcecode.md`](heredoc-api-sourcecode.md): executable heredoc examples and API/sourcecode doc conventions.
- [`extensions.md`](extensions.md): extension interfaces, implementation checklist, and extension safety rules.
- [`../CHANGELOG.md`](../CHANGELOG.md) and [`../VERSIONING.md`](../VERSIONING.md): release history and version policy.

## Core Documents

- [`architecture-overview.md`](architecture-overview.md) - visual system flow and request/session sequence diagrams.
- [`deployment-guide.md`](deployment-guide.md) - deployment matrix, environment contracts, and run commands.
- [`technical-design-plan.md`](technical-design-plan.md) - living architecture spec, active roadmap checklist, and deferred parking lot.
- [`operations-runbook.md`](operations-runbook.md) - incident triage, token rotation, and recovery procedures.
- [`heredoc-api-sourcecode.md`](heredoc-api-sourcecode.md) - Heredoc conventions and API/sourcecode documentation patterns.
- [`extensions.md`](extensions.md) - extension surfaces, implementation checklist, and example add-on flow.
- [`../CHANGELOG.md`](../CHANGELOG.md) - public release history.
- [`../VERSIONING.md`](../VERSIONING.md) - semantic versioning policy.

## Community and Governance

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- [`../SECURITY.md`](../SECURITY.md)
- [`../SUPPORT.md`](../SUPPORT.md)
- [`../AGENTS.md`](../AGENTS.md)
- [`../LICENSE`](../LICENSE) - Unlicense (public domain)

## Visual Assets

- [`screenshots/`](screenshots/) - Playwright-captured documentation images.
  - Includes both public locked and private unlocked dashboard captures.

Preview snapshots:

![Public locked dashboard](screenshots/main-overview-desktop-public-locked.png)

![Private unlocked dashboard](screenshots/main-overview-desktop-private-unlocked.png)

## Suggested Reading Order

1. [`architecture-overview.md`](architecture-overview.md)
2. [`deployment-guide.md`](deployment-guide.md)
3. [`technical-design-plan.md`](technical-design-plan.md)
4. [`operations-runbook.md`](operations-runbook.md)
5. [`heredoc-api-sourcecode.md`](heredoc-api-sourcecode.md)
6. [`extensions.md`](extensions.md)
7. [`../CHANGELOG.md`](../CHANGELOG.md)
8. [`../VERSIONING.md`](../VERSIONING.md)

## Validation Commands

```sh
npm run qa:strict   # unit tests with coverage gates + build
npm run test:e2e    # Playwright browser smoke tests
```

## Release Automation 🤖

- [`.github/workflows/publish-gpr.yml`](../.github/workflows/publish-gpr.yml) publishes the npm package to GitHub Packages on release tags.
- [`.github/workflows/publish-container.yml`](../.github/workflows/publish-container.yml) publishes the container image to GHCR on release tags.
