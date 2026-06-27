# Agentic Conventions 🤖

This repository is agent-friendly and supports autonomous coding workflows.

## Core Principles

- Keep changes incremental and test-backed.
- Update docs alongside behavior changes.
- Preserve security defaults (SSR server-side gateway auth path, no secret commits).
- Respect dark-mode-only visual policy.
- All theme presets must be dark-mode and map to existing `--color-terminal-*` tokens.
- Never touch system services or configs outside the repo without explicit permission.

## Standard Development Loop

This is the canonical workflow for developing features in this project:

1. **Research**: Spawn subagents to review online documentation, code, and existing patterns.
2. **Plan**: Write a comprehensive plan to disk (outside the source folder) with TODOs.
3. **Implement**: Work through TODOs incrementally, running `npm run qa:strict` after each tier.
4. **Test**: Add unit tests for every new code path; add e2e tests for UI changes; ensure
   coverage gates pass (≥ 84% unit branches ≥ 82%, ≥ 80% e2e, ≥ 98% docs).
5. **Validate locally**: Run `npm run lint && npm run lint:shell && npm run typecheck &&
   npm run qa:strict && npm run build && npm audit --omit=dev --audit-level=moderate`.
6. **Commit + push**: Commit all changes with a clear message; push the branch.
7. **Monitor CI**: Run `gh pr checks <PR> --repo <repo>` in a loop until all checks pass.
8. **Fix failures**: If any CI check fails, read the logs (`gh run view <run-id> --log-failed`),
   fix the issue, commit, push, and re-monitor. Repeat until all checks pass.
9. **DRY pass**: After all implementation, run DRY verification greps to ensure no duplicate
   patterns (adapters reuse `as*` helpers, renderers reuse `row`/`label`/`badge`, no duplicate
   docs lists, etc.).
10. **QE pass**: Run the full QE checklist (QA chain, coverage, security scan, build artifacts,
    doc consistency, lint/type cleanliness, live check, DRY, PR readiness).
11. **Update screenshots**: If UI changed, regenerate screenshots against the live gateway.
12. **Update docs + changelog**: Update all affected docs and `CHANGELOG.md`.
13. **Final push + monitor**: Push the final commit and monitor CI until all checks pass.

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
