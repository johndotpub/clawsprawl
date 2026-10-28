# ClawSprawl — OpenClaw Integration Health & Roadmap Analysis

**Analysis date:** 2026-09-14 (PDT)
**Repository:** `~/null-arbitrage/clawsprawl` (read-only inspection; no modifications made)
**Remote:** `git@github.com:johndotpub/clawsprawl.git` · public · Unlicense
**Analyzed revision:** branch `fix/ts6-peer-dep-fasturi-override` @ `93d51a1`
**Target gateway:** OpenClaw `2026.9.4` (3a9d69d), local gateway on `lorica`, up on `127.0.0.1:18789`

---

## 1. Project Overview

### What it is

ClawSprawl is the **Astro-based operations surface for autonomous agent swarms** — a terminal-themed narrative shell plus a live dashboard that reads from the OpenClaw gateway through a server-side SSR boundary. It is explicitly *read-only*: it renders telemetry, it does not mutate control-plane state.

- Purpose/non-goals: `docs/technical-design-plan.md` §Purpose, §Non-Goals
- Positioning: "internal operations surface" with `noindex, nofollow` default posture — `README.md`

### Version & lifecycle

| Fact | Value | Source |
|---|---|---|
| Version | `0.44.0` «Uplink» | `package.json:24`, `CHANGELOG.md:8` |
| Package | `@johndotpub/clawsprawl` → GitHub Packages | `package.json:2`, `publishConfig` |
| License | Unlicense (public domain) | `LICENSE` |
| Node engines | `>=22.12.0`; `.nvmrc` = `22.13.0` | `package.json:26`, `.nvmrc` |
| Commits / first commit | 202 / 2026-04-13 | `git rev-list --count HEAD` |
| Latest commit | 2026-09-14 (CI/deps automation restructure) | `git log` |

### Architecture

**One-liner:** An Astro 7 SSR server holds a single long-lived server-side WebSocket connection to the OpenClaw gateway, caches normalized RPC snapshots, and serves a redacted public view plus an authenticated private view to browsers over JSON + SSE-invalidation — the browser never touches the gateway and never sees the gateway token.

- Runtime: Astro `output: 'server'` with `@astrojs/node` standalone adapter — `astro.config.mjs`
- Mermaid system + sequence diagrams — `docs/architecture-overview.md`
- Data flow (8 steps) — `docs/technical-design-plan.md` §Data Flow
- Module map — `docs/technical-design-plan.md` §Module Map

### Key modules

| Layer | File | Role |
|---|---|---|
| Gateway | `src/lib/gateway/client.ts` | WS protocol client, reconnect/backoff, RPC pending map, primary→fallback URL retry |
| Gateway | `src/lib/gateway/protocol.ts` | Frame build/parse, connect params, Ed25519 v3 device signing, `PROTOCOL_VERSION = 4` |
| Gateway | `src/lib/gateway/server-service.ts` | Server singleton: cache, 120 s refresh, event ring buffer (500), SSE fanout |
| Gateway | `src/lib/gateway/state-machine.ts` | 7-state connection guard (`canTransitionConnectionState`) |
| Gateway | `src/lib/gateway/types.ts` | Wire frame + payload contracts |
| Dashboard | `src/lib/dashboard/adapters.ts` | All RPC normalizers (~700 lines) |
| Dashboard | `src/lib/dashboard/panel-config.ts` | Single source of truth for panel ids/titles/visibility |
| Dashboard | `src/lib/dashboard/renderers/panels.ts` + `shared.ts` | 20 renderer fns; `EVENT_BUCKET_TABLE` maps gateway events → 20 filter buckets |
| Dashboard | `src/lib/dashboard/bootstrap.ts` | Browser fetch/SSE bootstrap, 30 s refresh, 90 s staleness threshold |
| Dashboard | `src/lib/dashboard/store.ts` | Browser state store (`applySnapshot`, ring buffer, daily-cost cap 365) |
| Dashboard | `src/lib/dashboard/public-private.ts` | Public allowlist redaction boundary |
| Auth | `src/lib/auth/access.ts` | Access modes, private sessions, timing-safe compare, IP rate limit |
| HTTP | `src/middleware.ts` | `/api/private/*` enforcement + security headers |
| API | `src/pages/api/public/{dashboard.json,events}.ts`, `src/pages/api/private/{dashboard.json,events,health.json,session}.ts` | Split public/private routes |
| API (deprecated) | `src/pages/api/{dashboard.json,events,health.json}.ts` | Return `410` |

### UI surface

- **20 panels**: 18 metadata-driven in `panel-config.ts` + agent list + activity feed (authored in `src/components/dashboard/GatewayBootstrap.astro`)
- Public panels (12): System Status, Channel Health, Cron Health, Model Providers, Model Browser, Token Usage, Memory Health, Tool Catalog, Skills Inventory, Channel Accounts, Scheduler
- Private panels (6+2): Connected Clients, Sessions, Configuration, Permission Activity, Tool Executions, File Changes, Session Details, + Activity Feed
- 6 dark-only themes (`sprawl`, `cyberpunk`, `midnight`, `ember`, `mono`, `slate`) — `src/config/themes/presets.ts`
- Profile-driven branding (`sprawl-lab` default, `public-demo`, `*.local.ts`) — `src/config/profiles/`
- Container: Chainguard `node` pinned by digest, Node permission-model flags (`--allow-fs`, `--allow-net`), `HEALTHCHECK` — `Dockerfile`

---

## 2. Integration Points with OpenClaw

### How it discovers/connects

1. `GatewayServerService` builds a `GatewayClient` from env — `src/lib/gateway/server-service.ts` (constructor)
   - URL: `OPENCLAW_GATEWAY_WS_URL` ?? `ws://localhost:18789/ws`, fallback `ws://127.0.0.1:18789/ws`
   - Identity: `CLAWSPRAWL_CLIENT_ID` ?? `openclaw-control-ui`, mode `webchat`, role `operator`
   - Scopes: `OPENCLAW_GATEWAY_SCOPES` ?? `['operator.read']` (least privilege)
   - `caps: ['agent-kind']` (typed `agents.list` roster)
   - `maxProtocol`: `OPENCLAW_GATEWAY_MAX_PROTOCOL` (v5 forward-compat) else compiled `4`
2. Handshake — `src/lib/gateway/client.ts` `handleHandshakeMessage`:
   - Gateway sends `connect.challenge` `{nonce, ts}` → client builds `connect` request
   - Optional Ed25519 v3 device signature (`buildDeviceAuthPayloadV3`, payload = `v3|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce|platform|deviceFamily`)
   - `device.id` auto-derived as SHA-256 of the raw 32-byte Ed25519 public key (`deriveDeviceId`)
   - `hello-ok` → cached snapshot/features/policy; `hello-ok.features.methods|events` populate `availableMethods`/`availableEvents`
3. Steady state: RPC over WS + broadcast events over WS (SSE gateway stream retired in v0.43.0)

### What it renders (17 RPC methods consumed)

`src/lib/gateway/server-service.ts` `refreshData()` — all fired in parallel with individual `.catch(() => null)`:

| Panel(s) | Methods |
|---|---|
| System Status, hero | `status`, `health` |
| Agents, sessions-by-agent | `agents.list` (envelope `{defaultId, mainKey, scope, agents[]}`) |
| Sessions / Session Details | `sessions.list` (native `key` field; agentId derived from `agent:<id>:<rest>`) |
| Cron Health | `cron.list`, `cron.runs` |
| Model Providers, Model Browser | `models.list` |
| Connected Clients (private) | `system-presence` (canonical; `presence.list` removed in v0.43.0) |
| Token Usage | `usage.cost`, `usage.status` |
| Tool Catalog | `tools.catalog` |
| Skills Inventory | `skills.status` |
| Channel Accounts | `channels.status` |
| Scheduler | `cron.status` |
| Memory Health | `doctor.memory.status` |
| Configuration (private) | `config.get` (field allowlist `CONFIG_SAFE_KEYS` in `adapters.ts`) |
| File Changes (private) | `agents.files.list` |

**Events consumed:** 31 gateway event types bucketed into 20 filter chips — `EVENT_BUCKET_TABLE`, `src/lib/dashboard/renderers/shared.ts`. Special banners: `update.available`, `shutdown`, `payload.large`.

### Delivery to browser

- `GET /api/public/dashboard.json` — redacted, allowlist-shaped snapshot (`buildPublicSnapshot`); `sessions`, `presence`, `configData`, `cronJobs`, `cronRuns`, `usageCost`, `usageStatus`, `memoryStatus`, `fileStatus`, `sessionDetails` all nulled
- `GET /api/public/events` — SSE **invalidation only** (`snapshot-updated` + 30 s `ping`); never forwards `gateway-event`
- `GET /api/private/*` — full snapshot + raw `gateway-event` SSE stream

### Auth model

- **Gateway credential:** `OPENCLAW_GATEWAY_TOKEN`, server-side only, never serialized to browser (`README.md` §Auth Model)
- **Access modes** (`CLAWSPRAWL_MODE`): `public` (private routes 401) | `token` (bearer bootstrap → `httpOnly` session cookie) | `insecure` (private-network only)
- **Session:** server-backed in-memory Map, capped 24 h (`MAX_SESSION_MAX_AGE_HOURS`), pruned every 5 min, max 10 000 sessions
- **Hardening:** `timingSafeEqual` on SHA-256 digests; per-IP rate limit 10 attempts → 15 min lockout; bounded failure map (50 k entries); `secure` cookie in production; `sameSite: lax`
- **Headers:** HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP on `/api/*`, `X-Request-ID` — `src/middleware.ts`
- **Loopback-only enforcement:** non-loopback gateway URLs rejected at handshake unless device identity — `verifyGatewayNonce`, `src/lib/gateway/client.ts`

### Observed local integration state (2026-09-14)

| Check | Result |
|---|---|
| Gateway reachable | ✅ `http://127.0.0.1:18789/` → HTTP 200 |
| ClawSprawl SSR server running | ❌ nothing on `:4321` (HTTP 000) |
| `.env` keys present | `OPENCLAW_GATEWAY_TOKEN`, `CLAWSPRAWL_MODE`, `PUBLIC_MAINFRAME_PROFILE` |
| `.env` device identity | ❌ **zero** `CLAWSPRAWL_DEVICE_*` keys |
| Working tree | 4 modified files (`ci.yml`, `publish-gpr.yml`, `security.yml`, `audit.test.ts`), 3 open Dependabot PRs (#95, #96, #97) |
| Gateway host facts | 5 agents · 200 sessions · 4 active tasks · heartbeat disabled for all agents |

---

## 3. Current Limitations / TODOs

### TODO/FIXME/HACK/XXX scan

**Result: zero.** A case-insensitive grep across `src/ docs/ scripts/ tests/ README.md CHANGELOG.md` returns exactly one hit, and it is a false positive — the string `'todo.updated'` inside an event-bucket unit test (`src/lib/dashboard/renderers.test.ts:276`). The codebase is unusually clean of inline debt markers.

### Open issues

```
gh issue list --repo johndotpub/clawsprawl --state open   → [] (empty)
gh issue list --repo johndotpub/clawsprawl --state all    → [] (empty)
gh repo view --json hasIssuesEnabled                      → true
```

**0 open issues, 0 closed issues.** The tracker is enabled (`hasIssuesEnabled: true`) with templates present (`bug_report.yml`, `feature_request.yml`, `blank_issues_enabled: false`, `.github/ISSUE_TEMPLATE/`) but has never been used. **3 open Dependabot PRs** (#95 `@astrojs/node` 11.1.0→11.1.5, #96 `typescript` 6.0.3→7.0.2, #97 github-actions group); #96 is a known ecosystem-blocked major (documented in `CHANGELOG.md` 0.44.0).

### Deferred roadmap items

`docs/technical-design-plan.md` — unchecked `[ ]` items:

| Epic | Item | Status gap |
|---|---|---|
| A | Cross-doc consistency pass (`README`/`SECURITY`/`AGENTS`/`VERSIONING`) | Never done |
| C | Final DRY/hardening pass after regression verification | Never done |
| E | Final pre-release secret/history sweep (gitleaks/trufflehog/git-secrets/detect-secrets) | Never done |
| F | Map now-stable private RPCs to private panel surfaces | Never done — the open capability work |

Also structurally stale:
- Roadmap section is titled **"v0.42.0 Active Roadmap"** while the shipped version is **0.44.0** (3 releases of drift).
- `docs/technical-design-plan.md` §OpenClaw Capability Audit is pinned to **v2026.6.11 / v2026.7.1**; the live gateway is **2026.9.4** — a 2-month, 2-minor-version capability gap.
- `src/lib/gateway/client.test.ts:589` still labels the nonce section "verifyGatewayNonce **stub**" although the enforcement is now real (loopback-only).
- `src/pages/api/*` legacy routes still exist only to return `410` (intentional, documented, but dead weight).

### Recent git log themes (last ~70 non-merge commits)

1. **Dependency/CI automation churn (dominant, ~60%)** — Dependabot groups, SHA-pinned actions, auto-merge workflow, required-check readiness, `ci+deps: automation restructure` (2026-09-14).
2. **Toolchain peer-compat firefighting** — `typescript ^6.0.3` pin, `fast-uri` override, `esbuild` override.
3. **OpenClaw protocol catch-up (the last real feature work)** — 2026-08-01/02: `feat(gateway): catch up to OpenClaw v2026.6/7 — protocol robustness + events`, `beta7-ready device pairing`, `loopback backend client identity`.
4. **Theming + test hardening** — 6 dark themes, theme CLI, e2e de-brittling.
5. **Security** — pinned actions, gitleaks, audit enforcement in-suite.

**Signal:** no feature work since 2026-08-02. The last ~40 days are maintenance-only.

---

## 4. Test / Build / E2E Health

### Unit (vitest)

- Config: `vitest.config.ts` — v8 coverage, `include: src/**/*.ts`, **excludes** `types.ts`, `renderers.ts` (pure re-export), `middleware.ts` (needs Astro runtime), `server-service.ts` (singleton, e2e-only), `theme-switch.ts` (browser JS)
- Thresholds: lines 84 / functions 84 / statements 84 / **branches 82**
- Scale: 21 test files, ~6 297 lines; 34 tests in `client.test.ts`, 68 in `adapters.test.ts`, 88 in `renderers.test.ts`, 22 in `tests/site-phases.test.ts`
- **Actual measured coverage** (`coverage/coverage-summary.json`): lines **94.45%**, statements **92.51%**, functions **95.2%**, branches **83.16%** — comfortably above every gate
- Coverage profile note: the excluded `server-service.ts` is the single largest integration file and is covered only indirectly; `bootstrap.ts` sits at 80.37% lines

### E2E (Playwright, Chromium only)

| Spec | Tests | Gate |
|---|---|---|
| `tests/e2e/homepage.spec.ts` | 4 | Always (CI `e2e` job) |
| `tests/e2e/theme-switch.spec.ts` | 2 | Always |
| `tests/e2e/docs-screenshots.spec.ts` | 2 | `DOCS_SCREENSHOTS=1` |
| `tests/e2e/code-coverage.spec.ts` | 1 | `E2E_COVERAGE=1`, asserts **≥ 80%** JS runtime coverage |
| `tests/e2e/live-gateway.spec.ts` | 7 | `E2E_LIVE_GATEWAY=1` — full browser → SSR → gateway stack |

What e2e actually asserts: homepage renders Hero + dashboard, 12 public panels visible while 8 private panels count 0 by default, private-preview explains locked cards, mobile 390 px has no horizontal overflow, theme switch persists, and (live-gateway) `connectionState === 'connected'`, public snapshot redactions hold (`sessions: []`, `presence: []`, `configData: null`), legacy routes `410`, SSE keepalive `ping` arrives, retry button re-bootstraps.

- Config `playwright.config.ts`: `baseURL http://127.0.0.1:4321`, `webServer` = `npm run dev`, `retries: CI ? 1 : 0`, trace on first retry
- **Gap:** all live-gateway coverage is opt-in via env var, so CI exercises only the *unconnected* degraded path. There is no scheduled live-integration job.

### Docs & security gates

- Docs coverage: `scripts/qa/docs-coverage.mjs` — 16 required checks at **≥ 98%**
- Prod audit: `tests/security/audit.test.ts` → `scripts/qa/audit-check.mjs --omit=dev` (exit 2 = registry unreachable, skipped locally)
- CI jobs (`ci.yml`): `lint-and-test` (lint + shellcheck + `qa:strict` + prod audit + gitleaks), `dependency-audit` (advisory, `continue-on-error`), `e2e` (**deliberately no `needs:`** so it always reports — a skipped required check was observed as a silent hole on 2026-09-14), `container-build`
- Other workflows: `codeql.yml`, `security.yml` (gitleaks + audit + weekly cron), `dependabot-auto-merge.yml`, `publish-gpr.yml`, `publish-container.yml`

### Build health

- `npm run qa:strict` = lint → shellcheck → `astro check` (typecheck) → unit coverage → docs coverage → build
- `dist/` and `coverage/` artifacts present and current (built 2026-09-14 14:41)
- Dockerfile: 4-stage Chainguard build, digest-pinned, `USER node`, healthcheck, Node permission-model `CMD`

---

## 5. Opportunities

Baseline: ClawSprawl consumes **17** of the roughly **200+** RPC methods and **31** events advertised by the live OpenClaw 2026.9.4 gateway. I verified the presence of candidate methods directly in the installed gateway build (`~/.npm-global/lib/node_modules/openclaw/dist/method-scopes-*.mjs` and `dist/version-*.mjs` → `PROTOCOL_VERSION = 4`).

### 5.1 Protocol & capability groundwork (must precede features)

| # | Opportunity | Evidence | Status |
|---|---|---|---|
| P1 | Re-run the capability audit against 2026.9.4 and refresh the doc table | audit pinned to 2026.6/7 | **Likely supported by gateway today** |
| P2 | Protocol v5 readiness: raise `MIN_PROTOCOL_VERSION` when v5 ships | gateway dist shows `PROTOCOL_VERSION = 4` → **v5 still unreleased**; clawsprawl already has the env escape hatch | **Needs verification at v5 release** |
| P3 | Promote the "v0.42.0 Active Roadmap" heading + stale items to a current version | `docs/technical-design-plan.md` | N/A (doc work) |
| P4 | Add a scheduled live-gateway e2e job | `tests/e2e/live-gateway.spec.ts` is manually gated | **Likely supported** (CI-only change) |

### 5.2 Concrete feature ideas, mapped to gateway capabilities

Legend: ✅ **likely supported by gateway today** (method verified present in installed 2026.9.4 build) · ⚠️ **needs verification** (name present but payload shape/scope unknown)

| # | Feature | Gateway methods / events | Verification |
|---|---|---|---|
| F1 | **Task Ledger panel** — active/queued/running/issue task counts, per-task detail, audit status. Highest-value gap: `status.tasks` shows "4 active · 33 issues · audit clean · 374 tracked" but the dashboard resolves only coarse counts. | `tasks.list`, `tasks.get`, `tasks.history`, `tasks.dismiss`, `tasks.retry`, (`tasks.cancel` = operator.write) | ✅ |
| F2 | **Session Usage & Cost Timeseries panel** — per-session token/cost curves, top spenders, cache-read/write splits, replacing the current totals-only Token Usage card. | `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs` | ✅ |
| F3 | **Node Fleet panel** — paired node inventory, platform/version, live presence activity per node; makes the multi-host family visible in one panel. | `node.list`, `node.describe`, `node.pair.list`, `node.pending.pull`, events `node.presence*` | ✅ |
| F4 | **Gateway Stability panel** — bounded, payload-free stability recorder as a live feed; complements the event ring buffer for incident triage. | `diagnostics.stability`, `diagnostics.lanes` | ✅ |
| F5 | **Audit Activity timeline panel** — durable metadata-only activity ledger, ideal "who did what" strip for autonomous operations. | `audit.activity.list`, `audit.list`, `audit.run.inspect` | ✅ |
| F6 | **Effective Tooling panel** — session-scoped effective tool inventory + runtime command inventory, distinct from the static catalog. | `tools.effective`, `commands.list` | ✅ |
| F7 | **Voice/TTS panel** — TTS on/off, provider inventory, persona selection, last speak events. | `tts.status`, `tts.providers`, `tts.personas`, events `talk.event`, `talk.mode`, `voicewake.changed` | ✅ |
| F8 | **Heartbeat panel** — last persisted heartbeat + per-agent heartbeat config, so "disabled (ceo/bofh/ops/pfy)" fleet state is visible rather than inferred. | `last-heartbeat`; `agents.defaults.heartbeat.*` via `config.get` | ✅ |
| F9 | **Workspace Browser panel** — read-only file browsing across agent workspaces. Directly serves the private "File Changes" panel's stated purpose but with real directory structure. | `agents.workspace.list`, `agents.workspace.get`, `sessions.files.list/get` | ✅ |
| F10 | **Artifacts panel** — transcript-derived artifacts with list/get/download drill-down. | `artifacts.list`, `artifacts.get`, `artifacts.download` | ✅ |
| F11 | **Session Catalog / Branching panel** — searchable session catalog, branch listing/switching, compaction history and restore; a real navigation surface over the current flat session list. | `sessions.catalog.list/read`, `sessions.branches.list/switch`, `sessions.compaction.list/restore`, `sessions.search`, `sessions.preview`, `sessions.diff` | ✅ |
| F12 | **Session Groups panel** — group defaults/list/update, giving the fleet's channel-vs-DM topology a first-class view. | `sessions.groups.list/defaults/update` | ✅ |
| F13 | **Goal tracking panel** — render per-session goals (the `goal` concept used for long-horizon autonomous work). ClawSprawl renders nothing today. | `sessions.goal.update`, `sessions.goal.clear` (write-side); read side unconfirmed | ⚠️ needs verification (no read-only `sessions.goal.get` in the scope registry) |
| F14 | **Workboard panel** — orchestration board state (backlog/todo/running/blocked), claim/diagnostic state. The gateway ships a substantial workboard subsystem (54 dist files) but I found no `workboard.*` RPC in the method-scope registry. | workboard plugin surface | ⚠️ needs verification (may be plugin-HTTP, not WS RPC) |
| F15 | **Memory & Wiki panel extension** — semantic memory search from the dashboard; current Memory Health panel shows only embedding/dreaming counters. | `memory.search`, `doctor.memory.status` (already used), wiki plugin surface | ⚠️ needs verification for wiki (`wiki.*` not found in the scope registry) |
| F16 | **Canvas/A2UI panel** — gateway ships a large `a2ui` surface (164 dist files, `canvas.document.view`); rendering live canvas documents would let operators see what an agent is visually building. | `canvas.document.view` + a2ui assets | ⚠️ needs verification (payload/protocol shape unknown) |
| F17 | **Config Schema Explorer panel** — the private Configuration panel currently filters `config.get` through a 24-key allowlist, so it shows almost nothing useful. A read-only schema browser is strictly more informative and equally safe. | `config.schema`, `config.schema.lookup`, `config.get` | ✅ |
| F18 | **Channel Pairing panel** — pairing approvals/dismissals and per-channel start/stop state, extending the existing Channel Accounts card with actionable lifecycle detail (read-only display). | `channels.pairing.list`, `channels.status`, events `device.pair.*` | ✅ |
| F19 | **Skill Proposal review queue** — surface pending skill/workshop proposals and their security verdicts as a private panel; very high leverage for a fleet that authors skills. | `skills.proposals.list`, `skills.proposals.inspect`, `skills.securityVerdicts`, `skills.curator.status` | ✅ |
| F20 | **Gateway Self-Identity + Log Tail panel** — version/identity banner and a configured log tail for on-dashboard debugging. | `gateway.identity.get`, `logs.tail` | ✅ (explicitly deferred today — see below) |
| F21 | **Browser/node remote capability surface** — expose paired-node capabilities (e.g. the Android node's calendar/contacts/location/photos) as a read-only inventory. | `node.describe`, `node.runnerInventory.update` | ⚠️ needs verification |
| F22 | **Public "fleet pulse" widget** — a public-safe summary (agents online, tasks active/queued, channels healthy, update-available) for embedding. All source data is already public-allowlisted. | Reuses `status` + `health` + `channels.status` | ✅ |

### 5.3 Prioritized shortlist

1. **F1 Task Ledger** — largest visible gap between gateway truth and dashboard rendering; `status` already proves the data exists and is operationally meaningful ("33 issues · 374 tracked").
2. **F2 Session Usage Timeseries** — the dashboard already renders cost *totals*; the timeseries RPCs are stable and give per-agent spend attribution, which is the actual decision input for a multi-agent fleet.
3. **F3 Node Fleet + F4 Stability** — together they turn the dashboard from a *single-gateway* view into a *fleet* view, and directly address the loopback-only limitation's operational consequence (operators needing to see remote hosts).

Deliberately deferred by design (do not pursue without explicit scheduling): `logs.tail` and `gateway.identity.get` are marked "Defer unless explicitly scheduled"; all mutable/admin RPC families (`environments.*`, `sessions.dispatch`, `terminal.*` PTY, `ui.command`, `gateway.restart.*`, `gateway.suspend.*`) conflict with the project's read-only non-goal.

---

## 6. Summary

**Architecture one-liner:** Astro 7 SSR server that keeps one server-side WebSocket operator connection to the OpenClaw gateway, caches normalized RPC snapshots, and streams a redacted public view plus an authenticated private view to browsers over JSON + SSE-invalidation — the browser never sees the gateway token.

**Open issues:** **0** (0 open, 0 closed, 0 ever filed; 3 open Dependabot PRs).

**Top 3 integration gaps**

1. **Capability drift** — audit and protocol baseline pinned to OpenClaw 2026.6/7 while the live gateway is 2026.9.4; only 17 of 200+ available RPC methods are consumed, and Epic F ("map now-stable private RPCs") is still unchecked.
2. **Operator-scope fragility** — modern gateways grant no operator scopes to the token-only loopback path, so ClawSprawl *requires* a paired Ed25519 device identity; the local `.env` has **no** `CLAWSPRAWL_DEVICE_*` keys set, meaning the dashboard would render empty against the live 2026.9.4 gateway today.
3. **Verification blind spot** — the highest-value e2e suite (`live-gateway.spec.ts`, 7 tests) is opt-in behind `E2E_LIVE_GATEWAY=1` and never runs in CI, so all automated coverage exercises the *disconnected* path; combined with an empty issue tracker, integration regressions have no early-warning channel.

**Top 3 feature opportunities**

1. **Task & goal ledger panel** (`tasks.list/get/history` — likely supported today): turns the coarse `status.tasks` counts into a real operational board.
2. **Session usage & cost timeseries panel** (`sessions.usage` / `.timeseries` / `.logs` — likely supported today): per-agent spend attribution over time, upgrading the totals-only Token Usage card.
3. **Node fleet + gateway stability panels** (`node.list`/`describe`/`pair.list`, `diagnostics.stability`/`lanes` — likely supported today): makes the multi-host family and incident timeline visible in one surface.

---

### Source index

- `README.md`, `CHANGELOG.md`, `VERSIONING.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`
- `docs/README.md`, `docs/architecture-overview.md`, `docs/technical-design-plan.md`, `docs/deployment-guide.md`, `docs/operations-runbook.md`, `docs/extensions.md`, `docs/heredoc-api-sourcecode.md`
- `package.json`, `astro.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `Dockerfile`, `.env.example`, `.nvmrc`
- `src/lib/gateway/{client,protocol,server-service,state-machine,types}.ts`
- `src/lib/dashboard/{adapters,bootstrap,store,panel-config,public-private}.ts`, `src/lib/dashboard/renderers/{panels,shared}.ts`
- `src/lib/auth/access.ts`, `src/middleware.ts`
- `src/pages/api/public/*`, `src/pages/api/private/*`, `src/pages/api/*` (deprecated 410 routes)
- `tests/e2e/*`, `tests/site-phases.test.ts`, `tests/security/audit.test.ts`, `coverage/coverage-summary.json`
- `.github/workflows/{ci,security,codeql,dependabot-auto-merge,publish-gpr,publish-container}.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/config.yml`
- Live gateway evidence: `~/.npm-global/lib/node_modules/openclaw/package.json` (version 2026.9.4), `dist/version-*.mjs` (`PROTOCOL_VERSION = 4`), `dist/method-scopes-*.mjs` (RPC/scope registry), `openclaw status --deep`
