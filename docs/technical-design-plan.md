# ClawSprawl Technical Design Plan

Living architecture and roadmap document for ClawSprawl.

Historical release-by-release details live in `../CHANGELOG.md`.

## Source of Truth Policy

- Runtime behavior, security posture, and data flow are authoritative in code.
- Quality and release gates are authoritative in CI/workflow config.
- This document captures current architecture, active roadmap tasks, and deferred ideas.
- If this plan and code disagree, raise the conflict and decide with maintainer before changing behavior.

## Purpose

ClawSprawl is an internal operations surface for OpenClaw clusters:

- Narrative shell for cluster identity and operator context
- Live dashboard for real-time operational telemetry
- Read-only visibility surface (no control-plane mutations from UI)

## Goals

1. Keep telemetry live, accurate, and derived from gateway data only.
2. Keep auth server-side and least-privilege by default.
3. Keep architecture portable for local, self-hosted, and Tailscale environments.
4. Keep implementation DRY and test-backed.

## Non-Goals

- Public-internet multi-tenant auth platform
- UI mutation controls for gateway state/config
- Historical analytics warehouse in v0.x
- Replacing OpenClaw control/canvas surfaces

## Current Architecture

### Runtime Facts

- Astro SSR server (`output: 'server'` with `@astrojs/node`)
- Server connects to OpenClaw gateway via native WebSocket protocol v3
- Browser consumes split server APIs for public and private dashboard surfaces
- Browser never connects directly to gateway and never receives gateway token
- Dashboard updates in near real time via SSE + snapshot refresh

### Security and Auth

- Token source: `OPENCLAW_GATEWAY_TOKEN` (server-side only)
- Requested scopes default to least privilege: `operator.read`
- Optional scope override: `OPENCLAW_GATEWAY_SCOPES` (comma-separated, server-side only)
- Access mode is controlled by `CLAWSPRAWL_MODE=public|token|insecure`
- `CLAWSPRAWL_PRIVATE_TOKEN` is used only in `token` mode to bootstrap a private browser session
- Private dashboard access uses a secure `httpOnly` server-backed browser-session cookie with a 24-hour server-side cap
- `insecure` mode is private-network-only and must never be exposed on the public internet
- Internal-ops indexing posture: `noindex, nofollow`

### Data Flow

Data flow:

1. SSR server initializes gateway service singleton (`server-service.ts`).
2. Service performs challenge/connect handshake and caches normalized snapshot.
3. Service polls key RPC methods on interval and ingests gateway events (WS + SSE).
4. Browser fetches `/api/public/dashboard.json` and subscribes to `/api/public/events`.
5. Public SSE only signals snapshot invalidation; the browser re-fetches the public snapshot and re-renders public panels.
6. In `token` mode, the operator submits a bearer token to `/api/private/session` and receives a secure `httpOnly` session cookie.
7. Authenticated browsers fetch `/api/private/dashboard.json`, subscribe to `/api/private/events`, and render private cards on the same page.
8. In `insecure` mode, private routes are auto-authorized for the deployment without a token bootstrap.

### Deployment Modes

- `public`
  - public dashboard only
  - private routes return `401`
  - best fit for safe shared visibility without private detail
- `token`
  - public dashboard plus bearer-token-protected private view
  - server-backed browser session capped by `CLAWSPRAWL_SESSION_MAX_AGE_HOURS` (default `24`)
  - best fit for public internet deployments
- `insecure`
  - public and private dashboard surfaces are immediately visible
  - no token required
  - private-network-only; unsafe for public internet exposure

### Module Map

- `src/lib/gateway/client.ts` — WS protocol client + reconnect
- `src/lib/gateway/server-service.ts` — server singleton, cache, refresh, event fanout
- `src/lib/gateway/sse-client.ts` — gateway SSE stream client
- `src/lib/gateway/protocol.ts` + `src/lib/gateway/types.ts` — protocol contracts/helpers
- `src/lib/auth/access.ts` — access-mode parsing, bearer bootstrap, and private session helpers
- `src/pages/api/public/dashboard.json.ts` — public redacted snapshot route
- `src/pages/api/public/events.ts` — public snapshot invalidation SSE route
- `src/pages/api/private/session.ts` — private session create/delete route
- `src/pages/api/private/dashboard.json.ts` — full private snapshot route
- `src/pages/api/private/events.ts` — authenticated private SSE route
- `src/pages/api/private/health.json.ts` — authenticated private health route
- `src/pages/api/dashboard.json.ts`, `src/pages/api/events.ts`, `src/pages/api/health.json.ts` — deprecated legacy mixed routes returning `410`
- `src/lib/dashboard/store.ts` — browser state store
- `src/lib/dashboard/bootstrap.ts` — browser fetch/SSE bootstrap
- `src/lib/dashboard/panel-config.ts` — shared panel metadata source of truth
- `src/lib/dashboard/public-private.ts` — public/private data shaping and redaction boundary
- `src/lib/dashboard/renderers/*` — renderer modules

## Dashboard Panel Model

Panels are metadata-driven from `src/lib/dashboard/panel-config.ts`.

- `DASHBOARD_PANEL_DEFINITIONS` controls IDs, titles, layout classes, and wiring keys.
- Astro panel markup and browser bootstrap both consume this metadata.
- Panel count is derived (`DASHBOARD_PANEL_COUNT`) rather than hardcoded literals.
- Visibility policy is split into public and private panel groups from the same metadata source.

## Public Data Policy

Public routes are allowlist-based and summary-oriented.

- Public routes must not expose client identity, raw file paths, config internals, detailed session metadata, bot usernames, raw error text, or raw gateway events.
- Public SSE is invalidation-only and never forwards `gateway-event` payloads.
- Private routes may expose detailed operational data only when `token` mode or `insecure` mode permits it.

## Reliability

- Connection states: `idle | connecting | handshaking | connected | reconnecting | disconnected | error`
- Automatic reconnect with bounded backoff
- Event buffering with bounded memory
- Snapshot freshness checks + stale badge
- Manual retry control on degraded/error states

SLO-style targets:

- Freshness: snapshot refreshed at least every 30 seconds while connected
- Recovery: reconnect attempts begin within 1 second after disconnect/error
- UX recovery: retry control visible during degraded states

## Testing and Quality Gates

Mandatory release gate:

```sh
npm run qa:strict
```

Includes:

- Unit coverage gate (>= 84% target on core modules)
- E2E runtime code coverage gate (>= 80%)
- Documentation/heredoc coverage gate (>= 98%)
- Build success gate

Supplemental commands:

```sh
npm run test:e2e
npm run docs:screenshots
```

## OpenClaw Capability Audit

### Currently Consumed Methods

- `status`
- `agents.list`
- `sessions.list`
- `cron.list`
- `cron.runs`
- `models.list`
- `health`
- `presence.list`
- `usage.cost`
- `usage.status`
- `tools.catalog`
- `skills.status`
- `channels.status`
- `cron.status`
- `doctor.memory.status`
- `config.get`
- `agents.files.list`

### Available Upstream Methods Worth Evaluating

- `sessions.usage`
- `sessions.usage.timeseries`
- `sessions.usage.logs`
- `gateway.identity.get`
- `system-presence`
- `last-heartbeat`
- `logs.tail`
- `commands.list`
- `tools.effective`
- `tts.status`
- `tts.providers`

### Recommended Classification

- Implemented public-safe summary:
  - `usage.status` collapsed to provider quota/remaining panel rows
- Likely private-only candidates:
  - `sessions.usage`
  - `sessions.usage.timeseries`
  - `sessions.usage.logs`
  - `commands.list`
  - `tools.effective`
  - `last-heartbeat`
  - `tts.status`
  - `tts.providers`
- Defer unless explicitly scheduled:
  - `logs.tail`
  - `gateway.identity.get`
  - mutable or admin-oriented RPC families

## v0.42.0 Active Roadmap

Status legend: `[ ]` pending, `[~]` in progress, `[x]` complete.

### Epic A — Plan/Docs Governance Cleanup

- [x] Move the technical design plan into `docs/` and make docs index canonical
  - Acceptance: top-level README and docs index link to `docs/technical-design-plan.md`
  - Verify: `npm run test:docs:coverage`
- [ ] Add explicit cross-doc consistency pass (`README`, `SECURITY`, `AGENTS`, `VERSIONING`)
  - Acceptance: no contradictory architecture/auth statements
  - Verify: `npm run test:docs:coverage`

### Epic B — Access Mode Hardening

- [x] Replace mixed public/private routes with explicit split endpoints
  - Acceptance: public routes are redacted; legacy mixed routes return `410`
  - Verify: unit tests + browser tests
- [x] Replace marker-cookie auth with server-backed private sessions
  - Acceptance: private routes require token bootstrap or insecure mode
  - Verify: auth tests + route tests
- [x] Simplify deployment config to `CLAWSPRAWL_MODE`, `CLAWSPRAWL_PRIVATE_TOKEN`, `CLAWSPRAWL_SESSION_MAX_AGE_HOURS`
  - Acceptance: docs and `.env.example` match runtime behavior
  - Verify: docs coverage gate

### Epic C — DRY Runtime Refinement

- [x] Panel metadata single-source wiring (`panel-config.ts`)
  - Acceptance: panel count and DOM IDs derived from metadata
  - Verify: unit tests + `npm run build`
- [x] Snapshot batch apply path (`store.applySnapshot`) plus shared bootstrap snapshot mapping
  - Acceptance: public/private snapshot application avoids duplicated field wiring
  - Verify: unit tests + `npm run build`
- [ ] Final hardening and DRY cleanup pass after regression verification
  - Acceptance: no avoidable auth/redaction duplication remains
  - Verify: `npm run qa:strict`

### Epic F — Upstream API Folding

- [x] Fold `usage.status` into public usage panel summaries
  - Acceptance: dashboard usage card shows quota/remaining provider rows when available
  - Verify: adapter + renderer tests
- [ ] Evaluate private-only additions (`commands.list`, `tools.effective`, `tts.status`, `tts.providers`, `last-heartbeat`)
  - Acceptance: approved methods mapped to existing or new private panel surfaces
  - Verify: unit tests + e2e coverage

### Epic D — CI/Release Hardening

- [x] Enforce `qa:strict` in CI
  - Acceptance: PR/push workflow runs strict gates
  - Verify: `.github/workflows/ci.yml`
- [x] Publish workflow installs Playwright and validates tag/version match
  - Acceptance: release workflow fails fast on mismatch
  - Verify: `.github/workflows/publish-gpr.yml`
- [x] Add container release workflow for GHCR tag publishing
  - Acceptance: release tag builds and publishes `ghcr.io/<owner>/clawsprawl`
  - Verify: `.github/workflows/publish-container.yml`

### Epic E — Live Validation + Release Artifacts

- [x] Refresh docs screenshots against live gateway post-refactor
  - Acceptance: screenshots reflect current panel model and live data
  - Verify: `npm run docs:screenshots`
- [ ] Final pre-release secret/history sweep before public release
  - Acceptance: no true positive leaks across history and working tree
  - Verify: `gitleaks`, `trufflehog`, `git-secrets`, `detect-secrets`

## Parking Lot (Deferred)

- Optional long-term metrics/export surfaces (only if explicitly scheduled)
- Optional expanded observability hooks beyond the current public/private split
- Optional additional profile packs for public demo storytelling

Deferred items are intentionally unscheduled and are not release blockers.
