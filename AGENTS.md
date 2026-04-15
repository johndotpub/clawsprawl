# Agentic Conventions 🤖

This repository is agent-friendly and supports autonomous coding workflows.

## Core Principles

- Keep changes incremental and test-backed.
- Update docs alongside behavior changes.
- Preserve security defaults (SSR server-side gateway auth path, no secret commits).
- Respect dark-mode-only visual policy.

## Preferred Change Flow

1. Read relevant docs (`docs/technical-design-plan.md`, `docs/README.md`).
2. Implement changes in focused modules.
3. Add/update tests.
4. Run quality pass:

```sh
npm run qa:strict
npm run build
npm run test:e2e
```

5. Update `CHANGELOG.md` if user-facing behavior changed.

## Documentation Anchors

- `docs/technical-design-plan.md` — architecture and phase roadmap
- `docs/architecture-overview.md` — Mermaid system/request flow diagrams
- `docs/deployment-guide.md` — canonical setup/deploy/runtime command reference
- `CHANGELOG.md` — release history
- `VERSIONING.md` — semver policy
- `docs/operations-runbook.md` — canonical incident triage and SSR/gateway recovery procedures
- `docs/extensions.md` — extension surfaces and implementation checklist

## Commit Style

Use concise messages with intent first:

- `feat:` new behavior
- `fix:` bug fixes
- `chore:` infra/docs/process
- `docs:` documentation-only changes
