# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [0.42.1] - 2026-04-14

### Changed

- Dependency and audit baseline updated after v0.42.0 with Astro `^6.1.6` and Vite pinned to `7.3.2` via overrides to clear production security checks.
- Dashboard bootstrap tests were stabilized for CI timing and repeated `Response` body-read behavior.
- Documentation information architecture was reorganized so the repo homepage stays concise while deep technical content lives under `docs/`.
- Deployment guidance was consolidated under `docs/deployment-guide.md`, and incident triage/recovery remains canonical in `docs/operations-runbook.md`.

### Fixed

- `npm audit --omit=dev` pipeline failures caused by transitive Vite advisory in pre-merge branches.
- Flaky private unlock test behavior in `src/lib/dashboard/bootstrap.test.ts` during CI runs.
- Documentation secret-pattern false positive risk by using JSON token payload examples for private session bootstrap snippets.

### Quality

- Strict QA gates (`npm run qa:strict`) and e2e validation are passing on the post-release hardening branch.
- Cross-document references were normalized to use real clickable links and canonical doc ownership.

## [0.42.0] - 2026-04-12

### Added

- Public baseline release of ClawSprawl as an Astro SSR operations dashboard for OpenClaw clusters.
- Live dashboard with split public/private operational panels wired to gateway-backed data paths (no fake operational placeholders).
- Server-side gateway integration layer with native protocol v3 handshake, cache refresh, and event fanout.
- Browser runtime using public snapshot fetch + SSE invalidation, with private cards unlocked on the same page through authenticated `/api/private/*` routes.
- Metadata-driven panel model via `src/lib/dashboard/panel-config.ts` so Astro markup and bootstrap wiring share one source of truth.
- Modular renderer architecture via `src/lib/dashboard/renderers/shared.ts` and `src/lib/dashboard/renderers/panels.ts` with stable entrypoint re-exports.
- Strict lint + test + coverage quality gates integrated into local scripts and GitHub workflows.
- Public package/repository metadata and GitHub Packages release automation (`publish-gpr.yml`) with tag-version validation.
- Container packaging via multi-stage `Dockerfile` and GHCR release publishing workflow.

### Changed

- Dashboard data model is live-only: static operational placeholders removed from profile surfaces.
- Snapshot hydration now uses batched store application (`applySnapshot`) for cleaner, lower-churn updates.
- Gateway initialization lifecycle hardened so failed first boot attempts can recover without process restart.
- Live gateway E2E checks made topology-safe (no brittle fixed-count assumptions).
- Legacy mixed dashboard routes were deprecated in favor of explicit public/private route boundaries.
- Public usage telemetry now combines `usage.cost` totals with `usage.status` provider quota summaries.
- CI and publish workflows aligned to strict QA posture, including lint checks and Playwright dependency install steps.
- CI now includes container image build validation (`container-build` job) for Docker regression detection.
- Technical design plan converted from phase diary into a living architecture spec + active roadmap + parking lot.
- Package identity aligned for public owner and GitHub Packages publishing (`@johndotpub/clawsprawl`).

### Fixed

- Event-derived activity panels aligned to actual gateway event names (permission and tool execution flows).
- JSON serialization edge case for `sessionsByAgent` map snapshots.
- Snapshot SSE notification behavior so clients receive refresh updates beyond initial connection.
- Health route initialization behavior to avoid stale pre-bootstrap responses.
- Config rendering truncation and duplication issues in dashboard renderer output.
- Sensitive operator data exposure from unauthenticated dashboard surfaces by splitting public-safe snapshots from authenticated private cards.

### Security

- Server-side token auth model enforced (`OPENCLAW_GATEWAY_TOKEN` is never exposed to browser clients).
- Default requested gateway scope reduced to least privilege (`operator.read`).
- Optional scope override added for advanced environments (`OPENCLAW_GATEWAY_SCOPES`).
- Private dashboard unlock separated from gateway auth via `CLAWSPRAWL_PRIVATE_TOKEN`, `CLAWSPRAWL_MODE`, and a secure server-backed browser-session `httpOnly` cookie with 24h server-side cap.

### Quality

- `qa:strict` passes with lint, unit coverage, e2e runtime coverage, docs coverage, and build gates.
- Full e2e suite passes, including live-gateway integration checks and runtime coverage probe.
- Live gateway screenshots regenerated for release documentation (`hero`, `main overview` desktop/mobile, `live ops`).
- Secret/history scans validated with gitleaks, trufflehog, git-secrets, and detect-secrets.
