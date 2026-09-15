# ClawSprawl → OpenClaw Gateway API Surface Inventory

**Subject:** local checkout `~/null-arbitrage/clawsprawl` @ commit `93d51a1` (v0.44.0)
**Purpose:** map every OpenClaw gateway API touchpoint the dashboard consumes, so gateway API changes can be diffed against this list.
**Method:** READ-ONLY static audit of `src/`, `tests/`, `scripts/`, `docs/`, config files. No repo files were modified.
**Date:** 2026-09-14

> Architecture note that drives the whole inventory: the **browser never talks to the OpenClaw gateway**. Only the Astro SSR server (`GatewayServerService`) holds a WebSocket to the gateway. The browser consumes ClawSprawl's own `/api/*` routes. So there are two distinct API surfaces: **(A) ClawSprawl server → OpenClaw gateway** (the migration-relevant one) and **(B) browser → ClawSprawl server** (breaks only if ClawSprawl itself changes).

---

## 1. WebSocket usage (ClawSprawl SSR server → OpenClaw gateway)

### 1.1 WebSocket URLs / routes

| Item | Value | Where |
|---|---|---|
| Primary WS URL | `ws://localhost:18789/ws` (default) | `src/lib/gateway/server-service.ts:74` |
| Fallback WS URL | `ws://127.0.0.1:18789/ws` | `src/lib/gateway/server-service.ts:75` |
| Env override | `OPENCLAW_GATEWAY_WS_URL` | `src/lib/gateway/server-service.ts:185-186` |
| WS route path | `/ws` (control-ui/operator socket) | `src/lib/gateway/types.ts:393`, `docs/deployment-guide.md:26` |
| Primary→fallback promotion | Retry primary every 60 s while on fallback | `src/lib/gateway/client.ts:98` (`PRIMARY_RETRY_INTERVAL_MS`), `client.ts:500-512` |
| Loopback-only guard | Non-loopback `wss://` URLs throw at handshake | `src/lib/gateway/client.ts:39-64` (`verifyGatewayNonce`) |

### 1.2 Handshake / auth flow (ordered)

1. Client opens `new WebSocket(url)`; on Node SSR an `Origin` header is injected from `options.origin` — `src/lib/gateway/client.ts:286-293`.
2. Gateway sends **`connect.challenge`** event with `payload: { nonce: string, ts: number }` — detected by `isConnectChallenge()` `src/lib/gateway/protocol.ts:307-312`; handled `src/lib/gateway/client.ts:378-380`.
3. Client replies with a **`connect`** request frame; params built by `buildConnectParams()` `src/lib/gateway/protocol.ts:191-227`; sent `src/lib/gateway/client.ts:384-385`.
4. Gateway responds with a `res` frame whose `payload.type === 'hello-ok'` — validated `src/lib/gateway/client.ts:391-396`. Invalid payload → `'Invalid HelloOk response from gateway'`.
5. Steady state: `req`→`res` RPC + inbound `event` broadcasts.
6. Timeouts: connect handshake `connectTimeoutMs` default 10 000 ms (`client.ts:107`); per-RPC `rpcTimeoutMs` default 30 000 ms (`client.ts:109`).

**Nonce signing (protocol v4 / "v3 payload"):** Ed25519 signature over the pipe-delimited string
`v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily`
— `buildDeviceAuthPayloadV3()` `src/lib/gateway/protocol.ts:135-156`; `signChallenge()` `protocol.ts:158-188`. `device.id` = SHA-256(hex) of the raw 32-byte Ed25519 public key (last 32 bytes of SPKI DER) — `deriveDeviceId()` `protocol.ts:120-132`.
The challenge nonce is **not** echoed as `_nonce` (strict gateways reject it) — comment `protocol.ts:85-90`.

### 1.3 Wire frame types (WS message types)

| Frame | Discriminator | Required fields | Where |
|---|---|---|---|
| RequestFrame | `type: 'req'` | `id: string`, `method: string`, `params?: unknown` | `src/lib/gateway/types.ts:23-28`; builder `protocol.ts:54-61` |
| ResponseFrame | `type: 'res'` | `id: string`, `ok: boolean`, `payload?`, `error?` | `types.ts:31-37`; validator `protocol.ts:91-94` |
| EventFrame | `type: 'event'` | `event: string`, `payload?`, `seq?`, `stateVersion?`, `_sseId?` | `types.ts:40-47`; validator `protocol.ts:95-98` |
| ErrorShape | — | `code: string`, `message: string`, `details?`, `retryable?`, `retryAfterMs?` | `types.ts:51-57` |
| StateVersion | — | `presence: number`, `health: number` | `types.ts:65-68` |

Parser `parseMessage()` `protocol.ts:83-111` returns `null` for malformed/unknown frames (client silently ignores them — `client.ts:335-336`, `client.ts:443-446`).

**Total WS message types = 3 wire frames (req/res/event) + `connect.challenge` handshake event (see §1.5 for the full event name set).**

### 1.4 RPC methods the server calls (client → gateway)

All issued in `refreshData()` — `src/lib/gateway/server-service.ts:467-484`. Every call is `.catch(() => null)` (one failure never blocks others).

| # | Method | Line | Normalizer |
|---|---|---|---|
| 1 | `status` | `server-service.ts:468` | `normalizeStatus` |
| 2 | `agents.list` | `:469` | `normalizeAgents` |
| 3 | `sessions.list` | `:470` | `normalizeSessions` + `normalizeSessionDetails` |
| 4 | `cron.list` | `:471` | `normalizeCronJobs` |
| 5 | `cron.runs` | `:472` | `normalizeCronRuns` |
| 6 | `models.list` | `:473` | `normalizeModels` |
| 7 | `health` | `:474` | `normalizeHealth` |
| 8 | `system-presence` | `:475` | `normalizePresence` |
| 9 | `usage.cost` | `:476` | `normalizeUsageCost` |
| 10 | `usage.status` | `:477` | `normalizeUsageStatus` |
| 11 | `tools.catalog` | `:478` | `normalizeToolsCatalog` |
| 12 | `skills.status` | `:479` | `normalizeSkillsStatus` |
| 13 | `channels.status` | `:480` | `normalizeChannelsStatus` |
| 14 | `cron.status` | `:481` | `normalizeCronScheduler` |
| 15 | `doctor.memory.status` | `:482` | `normalizeMemoryStatus` |
| 16 | `config.get` | `:483` | `normalizeConfigData` |
| 17 | `agents.files.list` | `:484` | `normalizeFileStatus` |
| + | `connect` (handshake) | `client.ts:385` | — |

Refresh cadence: event-driven debounced invalidation 500 ms (`server-service.ts:69, 418-423`) + reconciliation poll every 120 000 ms (`server-service.ts:67, 425-431`). All 17 issued in parallel via `Promise.all` (`:467`).

**Total distinct RPC methods = 17 + `connect` = 18.**

### 1.5 Event names the client sends / expects

**Specially handled (drive UI state), `src/lib/gateway/server-service.ts:379-401`:**

| Event | Payload read | Line |
|---|---|---|
| `update.available` | `{ currentVersion, latestVersion, channel }` | `:380-388` |
| `shutdown` | `{ reason, restartExpectedMs? }` | `:389-394` |
| `health` | (clears shutdown banner) | `:395-399` |
| `tick` | (clears shutdown banner) | `:395-399` |

**Full event-name registry the Activity Feed buckets** — `EVENT_BUCKET_TABLE` `src/lib/dashboard/renderers/shared.ts:128-176` (31 OpenClaw `GATEWAY_EVENTS` + dynamic + broadcast). Distinct names/patterns:

1. `connect.challenge` → handshake
2. `tick` → heartbeat
3. `heartbeat` → heartbeat
4. `health` → health
5. `presence` → presence
6. `node.presence` → presence
7. `node.presence.alive` → presence
8. `node.presence.activity` → presence
9. `shutdown` → shutdown
10. `update.available` → update
11. `payload.large` → payload
12. `config.changed` → config
13. `skills.changed` → config
14. `cron` → cron
15. `sessions.changed` → session
16. `session.message` → message
17. `session.operation` → session
18. `session.tool` → tool
19. `session.approval` → permission
20. `session.observer` → session
21. `agent` → agent
22. `chat` → message
23. `chat.send_timing` → latency
24. `chat.side_result` → message
25. `talk.event` → voice
26. `voicewake.changed` → config
27. `voicewake.routing.changed` → config
28. `exec.approval.*` → permission
29. `plugin.approval.*` → permission
30. `node.pair.*` → pairing
31. `device.pair.*` → pairing
32. `node.invoke.request` → node
33. `talk.mode` → voice
34. `terminal.*` → node
35. `session.*` (fallback) → session
36. `file.*` → file
37. `message.*` → message

**Events with dedicated renderers (payload field dependencies):**
- `exec.approval.*`, `plugin.approval.*` → `renderPermissionActivityRows` reads `payload.tool|toolName`, `payload.action`, `payload.result|response`, `payload.ts` — `renderers/panels.ts:399-420`.
- `session.tool` → `renderToolExecutionRows` reads `payload.tool|toolName|name`, `payload.durationMs`, `payload.success|ok`, `payload.error`, `payload.status`, `payload.ts` — `panels.ts:422-448`.
- `file.*` → `renderFileTrackingRows` reads `payload.path|file`, `payload.ts` — `panels.ts:450-492`.
- Any event → `renderEventRows` reads `event.event`, `event.payload`, `event.seq` — `panels.ts:27-46`; preview `formatEventPreview` `adapters.ts:257-265`.

**Total distinct event names/patterns handled = 37 (4 special + 33 registry incl. wildcards); `docs/heredoc-api-sourcecode.md:60-68` documents the canonical subset.**

`EVENT_BUCKET_TABLE` falls back to bucket `'other'` for unknown names (`shared.ts:188-193`), so unknown events don't crash — they just land in "other". `EVENT_BUCKETS` list = `shared.ts:179-183`.

### 1.6 Expected payload shapes (hello-ok + snapshot)

| Shape | Key fields | Where |
|---|---|---|
| `HelloOk` | `type:'hello-ok'`, `protocol`, `server{version,connId}`, `features{methods[],events[]}`, `snapshot`, `policy{maxPayload,maxBufferedBytes,tickIntervalMs}`, `auth?{role,scopes,deviceToken?,deviceTokens?,issuedAtMs?}`, `canvasHostUrl?` | `types.ts:182-209` |
| `Snapshot` | `presence[]`, `health`, `stateVersion{presence,health}`, `uptimeMs`, `configPath?`, `stateDir?`, `sessionDefaults?`, `authMode?`, `updateAvailable?` | `types.ts:167-183` |
| `ConnectParams` | `minProtocol`, `maxProtocol`, `client{id,version,platform,mode,displayName?}`, `auth?`, `role?`, `scopes?`, `caps?`, `device?`, `locale?`, `userAgent?` | `types.ts:103-113` |
| `ConnectDevice` | `id`, `publicKey`, `nonce?`, `signature?`, `signedAt?`, `deviceFamily?`, `modelIdentifier?` | `types.ts:91-99` |
| `PresenceEntry` | `ts`, `host?`, `ip?`, `version?`, `platform?`, `deviceFamily?`, `modelIdentifier?`, `mode?`, `lastInputSeconds?`, `reason?`, `tags?`, `text?`, `deviceId?`, `roles?`, `scopes?`, `instanceId?` | `types.ts:147-165` |

Policy defaults applied when fields absent: `tickIntervalMs 15 000`, `maxPayload 26 214 400`, `maxBufferedBytes 52 428 800` — `client.ts:341-347`.

**Capabilities advertised:** `caps: ['agent-kind']` (opts into typed `agents.list` system-vs-agent roster) — `server-service.ts:206-209`; omission logic `protocol.ts:216`.

---

## 2. HTTP usage

### 2.1 ClawSprawl server → OpenClaw gateway (HTTP)

**None.** There is **no** direct HTTP/REST call from the SSR server to the gateway. `OPENCLAW_GATEWAY_HTTP_URL` is used **only** as the WebSocket `Origin` header value — `src/lib/gateway/server-service.ts:201`, consumed at `src/lib/gateway/client.ts:288-289`.

Historically the codebase used a gateway `GET /event` SSE stream; this was **retired in v0.43.0** (the endpoint "never existed in the canonical gateway surface") — `server-service.ts:13-19`, `docs/architecture-overview.md`. The stale `Gateway2` `/event` edge remains drawn in `docs/architecture-overview.md:13` (doc drift, not runtime).

Gateway `/metrics` (Prometheus) is mentioned in `docs/operations-runbook.md` but **not consumed by any code**.

### 2.2 Browser → ClawSprawl server endpoints (Astro routes)

Constants: `src/lib/dashboard/bootstrap.ts:46-52`.

| Path | Method | Consumer | Route file | Response / notes |
|---|---|---|---|---|
| `/api/public/dashboard.json` | GET | `bootstrap.ts:47`, `fetchDashboard()` `:461` | `src/pages/api/public/dashboard.json.ts` | Public-safe snapshot; `sessionsByAgent` coerced to `{}`; `Cache-Control: no-store` |
| `/api/private/dashboard.json` | GET | `bootstrap.ts:48`, `:471` | `src/pages/api/private/dashboard.json.ts` | Full snapshot; 401 if no private session; `sessionsByAgent` → plain object |
| `/api/public/events` | GET (SSE) | `connectPublicSSE()` `bootstrap.ts:504-511` | `src/pages/api/public/events.ts` | `text/event-stream`; events `snapshot-updated`, `ping`; keepalive 30 000 ms |
| `/api/private/events` | GET (SSE) | `connectPrivateSSE()` `bootstrap.ts:514-534` | `src/pages/api/private/events.ts` | 401 if locked; events `gateway-event`, `snapshot-updated`, `ping`; session recheck 60 000 ms |
| `/api/private/session` | POST | `unlockPrivateView()` `bootstrap.ts:537-547` | `src/pages/api/private/session.ts` | `Authorization: Bearer <token>` or JSON `{token}`; 200→cookie, 401 `invalid-token`, 415 `invalid-content-type`, 429 `rate-limited`, 503 `private-view-disabled` |
| `/api/private/session` | DELETE | `lockPrivateView()` `bootstrap.ts:553` | same file | Clears cookie; 200 `{ok:true}` |
| `/api/private/health.json` | GET | ops/monitoring; asserted `tests/e2e/live-gateway.spec.ts:35` | `src/pages/api/private/health.json.ts` | 200/503; returns `ok`, `connectionState`, `serverVersion`, `clientVersion`, counters, `availableMethods`/`availableEvents` counts |
| `/api/dashboard.json` | GET | deprecated | `src/pages/api/dashboard.json.ts` | **410** + `Deprecation: true`, `Link` successor |
| `/api/events` | GET | deprecated | `src/pages/api/events.ts` | **410** |
| `/api/health.json` | GET | deprecated | `src/pages/api/health.json.ts` | **410** |

**Total HTTP endpoints = 10 routes (7 live + 3 legacy-410); direct gateway HTTP endpoints consumed = 0.**

### 2.3 SSE event names (server → browser)

`snapshot-updated`, `gateway-event`, `ping` — `src/pages/api/public/events.ts:26,30,33`; `src/pages/api/private/events.ts:33,41,48,58`; consumed `bootstrap.ts:506,519,528`.

---

## 3. Auth (to the OpenClaw gateway)

| Mechanism | Detail | Where |
|---|---|---|
| Shared secret | `OPENCLAW_GATEWAY_TOKEN` → `connect.params.auth.token`; server-side only | `server-service.ts:187`, `protocol.ts:211-214` |
| Device token | `CLAWSPRAWL_DEVICE_TOKEN` → `auth.deviceToken` | `server-service.ts:205`, `protocol.ts:212` |
| Role | `operator` (hard-coded) | `server-service.ts:198` |
| Scopes | `OPENCLAW_GATEWAY_SCOPES` (comma-split) else default `['operator.read']` | `server-service.ts:47-56,188`; `protocol.ts:210` |
| Client identity | `CLAWSPRAWL_CLIENT_ID` default `'openclaw-control-ui'`; mode `'webchat'` | `server-service.ts:194-195` |
| Client version | `__PACKAGE_VERSION__` (build-injected `package.json` version) | `protocol.ts:80`, `astro.config.mjs:17` |
| Device identity | Ed25519 keypair + derived device id; nonce signing (v3 payload) | `server-service.ts:202-204`, `protocol.ts:120-188` |
| Origin header | `OPENCLAW_GATEWAY_HTTP_URL` | `server-service.ts:201`, `client.ts:288-289` |
| Loopback-only policy | Only `localhost`/`127.0.0.1`/`0.0.0.0`/`::1` accepted device-less | `client.ts:39-64` |
| TLS | Plain `ws://` on loopback; `wss://` non-loopback is **rejected** | `client.ts:42-60` |
| Required scopes at runtime | `operator.read` for all 17 RPCs; `MISSING_SCOPE` hints surfaced | `server-service.ts:301-319` |
| Device pairing | Requires `npm run setup:device` + gateway `openclaw devices approve <id>` | `scripts/setup-device-identity.mjs`, `.env.example:60-84` |

**ClawSprawl *view* auth (browser → ClawSprawl, not gateway):** modes `public|token|insecure` (`CLAWSPRAWL_MODE`); bearer `CLAWSPRAWL_PRIVATE_TOKEN` → httpOnly cookie `clawsprawl_private_session` (24 h max). Rate limit 10 attempts / 15 min lockout. — `src/lib/auth/access.ts:14-16,58-59,114-116,141`.

Error enrichment: rejected RPCs surface `err.code`, `err.details`, `err.retryable`, `err.retryAfterMs` — `client.ts:449-475`.

---

## 4. Config surface (every env var / config key read)

### Gateway connection
| Env var | Default | Where |
|---|---|---|
| `OPENCLAW_GATEWAY_WS_URL` | `ws://localhost:18789/ws` | `server-service.ts:185-186` |
| `OPENCLAW_GATEWAY_TOKEN` | `''` | `server-service.ts:187` |
| `OPENCLAW_GATEWAY_HTTP_URL` | `http://127.0.0.1:18789` | `server-service.ts:201` |
| `OPENCLAW_GATEWAY_SCOPES` | `operator.read` | `server-service.ts:188` |
| `OPENCLAW_GATEWAY_MAX_PROTOCOL` | compiled `4` | `server-service.ts:211`, `parseMaxProtocol` `:57-63` |

### Client identity / device
| Env var | Default | Where |
|---|---|---|
| `CLAWSPRAWL_CLIENT_ID` | `openclaw-control-ui` | `server-service.ts:194` |
| `CLAWSPRAWL_CLIENT_MODE` | `webchat` | `server-service.ts:195` |
| `CLAWSPRAWL_DEVICE_ID` | — | `server-service.ts:202` |
| `CLAWSPRAWL_DEVICE_PUBLIC_KEY` | — | `server-service.ts:203` |
| `CLAWSPRAWL_DEVICE_PRIVATE_KEY` | — | `server-service.ts:204` |
| `CLAWSPRAWL_DEVICE_TOKEN` | — | `server-service.ts:205` |

### Access / server
| Env var | Default | Where |
|---|---|---|
| `CLAWSPRAWL_MODE` | `public` | `access.ts:114` |
| `CLAWSPRAWL_PRIVATE_TOKEN` | — | `access.ts:115` |
| `CLAWSPRAWL_SESSION_MAX_AGE_HOURS` | `24` (max 24) | `access.ts:116,106-112` |
| `CLAWSPRAWL_TRUST_PROXY` | off | `pages/api/private/session.ts:17` |
| `NODE_ENV` | — | `access.ts:141,217` |
| `CORS_ALLOW_ORIGIN` (Vite `import.meta.env`) | `''` | `middleware.ts:14` |

### Build / branding
| Env var | Default | Where |
|---|---|---|
| `PUBLIC_MAINFRAME_PROFILE` | `sprawl-lab` | `pages/index.astro:8`, `.env.example` |
| `PUBLIC_CLAWSPRAWL_THEME` | `sprawl` | `layouts/Base.astro:19` |
| `PUBLIC_SITE_URL` | `http://localhost:4321` | `astro.config.mjs:8` |
| `HOST` / `PORT` | `127.0.0.1` / `4321` | `.env.example` (Astro node adapter) |

### Test / CI-only
`E2E_LIVE_GATEWAY` (`tests/e2e/live-gateway.spec.ts:14`), `E2E_COVERAGE` (`code-coverage.spec.ts:3`), `DOCS_SCREENSHOTS` (`docs-screenshots.spec.ts:8`), `GITHUB_REPOSITORY_OWNER` (`scripts/qa/validate-package-scope.mjs:9`), `GITHUB_REF_NAME` (`validate-tag-version.mjs:9`).

**No gateway `openclaw.json` config keys are read by ClawSprawl** — the only gateway-adjacent config is `config.get` RPC output, filtered to a safe allowlist `CONFIG_SAFE_KEYS` (`adapters.ts:778-786`).

---

## 5. Feature dependencies (could break on gateway rename/reshape)

| Feature | Used? | Detail | Where |
|---|---|---|---|
| **WebSocket RPC + event bus** | ✅ core | Single WS carries both RPC and events | `client.ts`, `server-service.ts` |
| **Protocol negotiation v4** | ✅ | `minProtocol:3, maxProtocol:4`; v5 forward-compat env | `protocol.ts:74-77,199-200` |
| **`connect.challenge` nonce** | ✅ | Device-less path verifies + enforces loopback | `client.ts:378-380`, `protocol.ts:307` |
| **Device identity + v3 signature** | ✅ (required ≥ 2026.7.2-beta.6) | Ed25519 signing; `agent-kind` cap | `protocol.ts:120-188`, `server-service.ts:202-209` |
| **SSE streams (Astro-side)** | ✅ | `/api/public/events`, `/api/private/events`, 30 s keepalive | `pages/api/**/events.ts` |
| **EventSource (browser)** | ✅ | Two EventSources; auto-reconnect | `bootstrap.ts:504-534` |
| **Snapshot invalidation** | ✅ | `snapshot-updated` triggers re-fetch | `bootstrap.ts:506,528` |
| **Presence** | ✅ | hello-ok `snapshot.presence` + `system-presence` RPC; private-only render | `server-service.ts:285-287,475`, `panels.ts:213-228` |
| **Sessions list** | ✅ | `sessions.list`; key format `agent:<id>:<scope>` parsed for agentId | `adapters.ts:135-160`, `:846-870` |
| **Cron (list/runs/status)** | ✅ | Jobs (private), runs, scheduler | `server-service.ts:471-472,481` |
| **Channels (health + status)** | ✅ | `health.channels`/`channelOrder`/`channelLabels`; `channels.status` accounts | `adapters.ts:436-470,640-700` |
| **Usage (cost + status)** | ✅ | Daily rollups + provider quota | `adapters.ts:560-635` |
| **Tools catalog / skills status** | ✅ | Grouped tools, skill eligibility | `adapters.ts:637-690` |
| **Memory/dreaming status** | ✅ | `doctor.memory.status` embedding + phases | `adapters.ts:714-748` |
| **Config snapshot** | ✅ (private) | `config.get`, allowlist-filtered | `adapters.ts:778-792` |
| **Agent file status** | ✅ (private) | `agents.files.list` (read-only list, **not** content) | `adapters.ts:794-808` |
| **Update-available + shutdown banners** | ✅ | `update.available`, `shutdown` events; also hello-ok `snapshot.updateAvailable` | `server-service.ts:380-394`, `bootstrap.ts:407-430` |
| **Agent identity/caps roster** | ✅ | `caps:['agent-kind']` gates typed `agents.list` | `server-service.ts:206-209` |
| **Node presence / pairing / invoke** | ✅ events only | Bucketed, not called | `shared.ts:135-137,167-173` |
| **Canvas / embeds** | ❌ | `canvasHostUrl` typed but **never read/used** | `types.ts:208` |
| **Binary frames / ArrayBuffer / Blob** | ❌ | `onmessage` ignores non-string data | `client.ts:334` |
| **File upload / multipart / FormData / attachments** | ❌ | none | — |
| **Node/tool invocation calls** | ❌ | events bucketed only; no `node.*` RPC issued | `shared.ts:167-175` |
| **`OPENCLAW_GATEWAY_HTTP_URL` REST endpoints** | ❌ | used only as WS `Origin` | `server-service.ts:201` |
| **TLS to remote gateway** | ❌ blocked | non-loopback `wss://` rejected by design | `client.ts:39-64` |

**Protocol-version tracking notes (doc-level):** v4 baseline; v5 on OpenClaw `main` will be a hard break for v4-only clients; `OPENCLAW_GATEWAY_MAX_PROTOCOL=5` opts in without code change. Removed/renamed upstream to avoid: `node.pair.request`/`node.pair.verify`, `sessions.observer.ask` (use `sessions.companion.ask`). — `docs/technical-design-plan.md:191-214`, `docs/heredoc-api-sourcecode.md:54`.

---

## 6. File / line index (quick lookup)

| Concern | Primary files |
|---|---|
| WS client + handshake + reconnect | `src/lib/gateway/client.ts` |
| Frame builders, connect params, device signing | `src/lib/gateway/protocol.ts` |
| WS/protocol type definitions | `src/lib/gateway/types.ts` |
| Connection state machine (7 states) | `src/lib/gateway/state-machine.ts` |
| RPC orchestrator + caches + event buffer | `src/lib/gateway/server-service.ts` |
| Payload normalizers | `src/lib/dashboard/adapters.ts` |
| Event bucketing / render helpers | `src/lib/dashboard/renderers/shared.ts`, `renderers/panels.ts` |
| Browser fetch + EventSource wiring | `src/lib/dashboard/bootstrap.ts` |
| Public/private redaction | `src/lib/dashboard/public-private.ts` |
| Panel visibility metadata | `src/lib/dashboard/panel-config.ts` |
| View auth (ClawSprawl-side) | `src/lib/auth/access.ts` |
| Astro routes | `src/pages/api/**` |
| Device setup script | `scripts/setup-device-identity.mjs` |
| Live-gateway E2E | `tests/e2e/live-gateway.spec.ts` |

---

## 7. Checklist table — API surface item | where used | risk if OpenClaw changes it

| # | API surface item | Where used | Risk |
|---|---|---|---|
| 1 | WS route `/ws` + port 18789 + loopback-only policy | `server-service.ts:73-77,185`; `client.ts:39-64` | **High** |
| 2 | `connect` request method + ConnectParams shape | `protocol.ts:191-227`; `client.ts:384-385` | **High** |
| 3 | `connect.challenge` event + `{nonce,ts}` + nonce signing (v3 payload) | `protocol.ts:135-188,307-312`; `client.ts:378-380` | **High** |
| 4 | `hello-ok` payload (`type`, `protocol`, `server`, `features`, `snapshot`, `policy`) | `client.ts:391-396`; `types.ts:182-209` | **High** |
| 5 | Protocol version negotiation (`minProtocol`/`maxProtocol`; v4→v5 break) | `protocol.ts:74-77,199-200`; `server-service.ts:211` | **High** |
| 6 | RPC `status` (+ tasks/taskAudit/sessions/heartbeat shape) | `server-service.ts:468`; `adapters.ts:379-408` | **High** |
| 7 | RPC `agents.list` (+ `agent-kind` cap + `{agents:[...]}` envelope) | `server-service.ts:469,206-209`; `adapters.ts:104-133` | **High** |
| 8 | RPC `sessions.list` (+ `key` format `agent:<id>:...`) | `server-service.ts:470`; `adapters.ts:135-160,846-870` | **High** |
| 9 | RPC `health` (channels/channelOrder/channelLabels/probe shape) | `server-service.ts:474`; `adapters.ts:336-470` | **High** |
| 10 | EventFrame schema (`type:'event'`, `event`, `payload`, `seq`) | `types.ts:40-47`; `client.ts:443-446` | **High** |
| 11 | Operator scopes / `operator.read` + `MISSING_SCOPE` error shape | `server-service.ts:47-56,301-319`; `client.ts:449-475` | **High** |
| 12 | Device identity/paired-device requirement (Ed25519, device id hash) | `protocol.ts:120-188`; `server-service.ts:202-209` | **High** |
| 13 | Event names registry (37 patterns) | `shared.ts:128-183` | **Med** |
| 14 | `update.available` event payload | `server-service.ts:380-388`; `bootstrap.ts:407-419` | **Med** |
| 15 | `shutdown` event payload (`reason`, `restartExpectedMs`) | `server-service.ts:389-394`; `bootstrap.ts:421-430` | **Med** |
| 16 | RPC `cron.list` / `cron.runs` / `cron.status` | `server-service.ts:471-472,481`; `adapters.ts:196-241,702-712` | **Med** |
| 17 | RPC `models.list` (`{models:[...]}`, contextWindow/reasoning) | `server-service.ts:473`; `adapters.ts:243-274` | **Med** |
| 18 | RPC `channels.status` (channels/channelAccounts/account fields) | `server-service.ts:480`; `adapters.ts:640-700` | **Med** |
| 19 | RPC `usage.cost` / `usage.status` (daily/totals/provider quota) | `server-service.ts:476-477`; `adapters.ts:560-635` | **Med** |
| 20 | RPC `tools.catalog` / `skills.status` (groups/profiles/eligibility) | `server-service.ts:478-479`; `adapters.ts:637-690` | **Med** |
| 21 | RPC `doctor.memory.status` (embedding/dreaming/phases) | `server-service.ts:482`; `adapters.ts:714-748` | **Med** |
| 22 | RPC `config.get` (allowlist-filtered keys only) | `server-service.ts:483`; `adapters.ts:778-792` | **Med** |
| 23 | RPC `agents.files.list` (`{files:[...]}` / bare array) | `server-service.ts:484`; `adapters.ts:794-808` | **Med** |
| 24 | RPC `system-presence` + `snapshot.presence` entry fields | `server-service.ts:285-287,475`; `adapters.ts:411-434` | **Med** |
| 25 | `session.tool` event payload fields | `panels.ts:422-448` | **Med** |
| 26 | `exec.approval.*` / `plugin.approval.*` event payloads | `panels.ts:399-420` | **Med** |
| 27 | RPC error shape (`code`/`message`/`details`/`retryable`/`retryAfterMs`) | `types.ts:51-57`; `client.ts:449-475` | **Med** |
| 28 | `file.*` event payloads | `panels.ts:450-492` | **Low** |
| 29 | Reconnect/backoff behaviour + 60 s primary retry | `client.ts:98,470-512` | **Low** |
| 30 | ClawSprawl `/api/*` routes + SSE names (`snapshot-updated`/`gateway-event`/`ping`) | `pages/api/**`; `bootstrap.ts:46-52,504-534` | **Low** (internal) |
| 31 | Deprecated 410 routes (`/api/dashboard.json`,`/api/events`,`/api/health.json`) | `pages/api/{dashboard.json,events,health.json}.ts` | **Low** |
| 32 | `canvasHostUrl` / canvas / embed | `types.ts:208` (typed, unused) | **Low** |
| 33 | Binary frames / uploads | none | **Low** |
| 34 | Event bucket fallback `'other'` | `shared.ts:188-193` | **Low** |
| 35 | Stale-threshold / refresh cadence (client-side) | `bootstrap.ts:43-45`; `server-service.ts:67-69` | **Low** |

---

### Totals
- **WS wire frame types:** 3 (`req`/`res`/`event`) + 1 handshake event (`connect.challenge`).
- **WS RPC methods consumed:** 17 (+ `connect`) = **18**.
- **WS event names/patterns handled:** **37** (4 specially handled, 33 in the bucket registry incl. wildcards).
- **HTTP endpoints:** **10** ClawSprawl routes (7 live + 3 legacy-410); **0** direct gateway HTTP endpoints consumed (`OPENCLAW_GATEWAY_HTTP_URL` is Origin-only).
- **Env vars read:** **23** (5 gateway, 6 client/device, 4 access/server, 4 build/branding, 5 test/CI — overlapping across categories).

### Top 5 highest-risk dependencies
1. **WS route + connect handshake** (`/ws`, `connect.challenge` → `connect` → `hello-ok`) — all data flows through this; any reshape is total breakage.
2. **Protocol version negotiation** (v4 baseline; v5 is a stated hard break) — `protocol.ts:74-77`, `server-service.ts:211`.
3. **17 RPC method names + response envelopes** (esp. `status`, `agents.list`, `sessions.list`, `health`) — names/envelopes are hard-coded in `server-service.ts:467-484`.
4. **`hello-ok` snapshot/policy/features shape** (`presence`, `health`, `stateVersion`, `features.methods/events`, `policy.tickIntervalMs`) — parsed at handshake, drives caches and update banner.
5. **Device identity + paired-device/`agent-kind` cap requirement** — modern gateways grant zero operator scopes without a paired device; `operator.read` gates all 17 RPCs.
