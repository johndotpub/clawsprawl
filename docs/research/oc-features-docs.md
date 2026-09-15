# OpenClaw features/changes relevant to clawsprawl (external Astro dashboard over Gateway WS/HTTP)

Research date: 2026-09-14. Local install: OpenClaw 2026.9.4 (docs package root: `/home/openclaw/.npm-global/lib/node_modules/openclaw/`, docs dir `docs/`, CHANGELOG at package root).
Window covered: versions ~2026.7.x through 2026.9.4.

**Verification method:** Local installed docs (authoritative for the installed version) read first, then
docs.openclaw.ai fetches for release notes / package guidance. Web searches timed out or 404'd
(documented below under "Unverified / not reachable").

Legend: **[CONFIRMED-DOC]** = official local or fetched docs. **[WEB-RUMOR/UNVERIFIED]** = could not verify.
Doc paths are relative to `/home/openclaw/.npm-global/lib/node_modules/openclaw/docs/` unless a URL is given.

---

## 0. Version / release map (from official docs)

- **[CONFIRMED-DOC]** `https://docs.openclaw.ai/releases` lists shipped releases in the window:
  v2026.9.4, v2026.9.3, v2026.9.2, v2026.9.1, v2026.8.2, v2026.8.1 ("AKA OpenClaw 2.0"),
  v2026.7.1, v2026.6.11.
- **[CONFIRMED-DOC]** Docs state verbatim: "There is no v2026.7.2 release. The `v2026.7.2` betas
  shipped as v2026.8.1." (`https://docs.openclaw.ai/releases`) — so any "2026.7.2" changelog/rumor
  you see elsewhere describes work that landed in 2026.8.1.
- **[CONFIRMED-DOC]** Local `CHANGELOG.md` in the installed package contains only the 2026.9.4
  section (plus its complete contribution record). Older release notes live at
  `https://docs.openclaw.ai/releases/<version>` (e.g. `/releases/2026.8.2`, `/releases/2026.9.3`).
- **[CONFIRMED-DOC]** Client packages are pinned separately from the CLI release train:
  "Install the verified stable release, `2026.8.1`" for `@openclaw/gateway-client` /
  `@openclaw/gateway-protocol`; the 2026.8.1 packages export **wire version 4**. (`gateway/clients.md`)
- **[CONFIRMED-DOC]** Release-note highlights fetched: v2026.9.4 = plugin/skill discovery, visible
  skill learning, cloud-worker controls, GPT Image 2.5, terminal questions; v2026.9.3 = clean update
  recovery, faster session reconnects, live browser automation, revocable chat links, searchable
  meeting transcripts, repository-backed cloud work; v2026.9.1 = Mermaid diagrams across chat
  surfaces, fuller Android, safer update recovery; v2026.8.2 = Home button, Linux desktop companion,
  background sessions, browser control without a running Gateway, four new Control UI looks.
  (`https://docs.openclaw.ai/releases/2026.9.4`, `/2026.9.3`, `/2026.9.1`, `/2026.8.2`)

---

## 1. TOP FIVE NEW CAPABILITIES clawsprawl COULD ADOPT

### 1.1 Session Dashboards: a full board/widget protocol on the Gateway  [CONFIRMED-DOC]

This is the single biggest dashboard-relevant feature set. clawsprawl can act as a third-party
board client, not just a chat viewer.

- Boards belong to a **session** (`sessionKey`), stored in the owning agent's SQLite DB
  (`agents/<agentId>/agent/openclaw-agent.sqlite`, tables `board_tabs`, `board_widgets`).
  Board survives `/new` and `/reset`; deleting a session deletes its board. (`web/dashboard-architecture.md`)
- **RPCs (core method table, TypeBox schemas in `gateway-protocol`):**
  - `canvas.document.view { docId }` → HTML + sandbox metadata — `operator.read` (≤2 MiB, no board state, no capability ticket)
  - `board.get { sessionKey }` → tabs + widget metadata + native props (no document bytes) — `operator.read`
  - `board.update { sessionKey, ops[] }` — tab CRUD/reorder, widget move/resize/remove/unpin, dock, focus-tab — `operator.write`
  - `board.widget.put { sessionKey, name, content, declared?, placement? }` — `operator.write`
  - `board.widget.grant { sessionKey, name, decision }` — `operator.approvals`
  - `board.event { ticket, payload }` — tier-1 state-event ingest (legacy `{sessionKey,widget,payload}` shape retained) — `operator.write`
  - `board.prompt.authorize { ticket }` — `operator.read`
  - `board.data.read { ticket, bindingId, params? }` — gateway-side allowlisted read binding — `operator.read`
  - `board.action { ticket, action, ... }` — exact-grant automation dispatch — `operator.write`
- **Events:** `board.changed { sessionKey, revision, widget? }` (refetch board; reload one iframe when `widget` present);
  `board.command { sessionKey, command }` (transient UI drive, same `ui.command` pattern).
- **Widget content kinds:** `session:report` (native data report — text, metrics, tables, bar/line charts,
  links; no iframe/HTML/scripts/network; ≤8 KB JSON, ≤24 blocks, 8 KB per native widget props), `html`
  (agent-authored, byte-frozen), `mcp-app` (third-party MCP App `ui://`), and registered plugin kinds
  (Canvas plugin registers `a2ui`).
- **Board limits:** 256 KB per document, 8 KB native props, 48 widgets per board, 12-column auto-compacting
  grid, size vocabulary `sm|md|lg|xl|full`, `after: <widgetName>` ordering anchor.
- **Board HTTP surface for widget bytes:** core gateway route
  `/__openclaw__/board/<agentId>/<sessionKey>/<name>/` (reads the DB). Inline Canvas bytes go through
  `canvas.document.view`. **A2UI renderer bundle** served from `/__openclaw__/a2ui/` asset route.
- **Presentation / layout:** agent can request `split` or `expanded` via `dashboard` tool `set_presentation`;
  Control UI owns dock position (left/right/below). Browser stores the arrangement per session.
- **Gallery + deep links:** `/dashboards` card gallery (search by thread/author, filter, sort);
  chat/dashboard parallel route namespaces `/chat/...` and `/dashboard/...`; `?dashboard=expanded`
  focuses the dashboard; `/focus/dashboard/<agentId>/<sessionRef...>` renders board without app chrome.
  (`web/dashboards.md`, `web/urls.md`)
- **Note for a non-Control-UI client:** native report rendering needs no document fetch/iframe;
  HTML widgets need the sandboxed double-iframe host with a dedicated origin and ticket-bound bridge.
  If clawsprawl renders HTML widgets itself it must reproduce that sandbox boundary.
- **Migration/removal warning:** the experimental `extensions/workspaces` plugin, its CLI, `workspace_*`
  tools and the Control UI Workspaces tab were **deleted**; `openclaw doctor --fix` deletes legacy
  `<stateDir>/workspaces/` **without importing**. (`web/dashboard-architecture.md`, `web/dashboards.md`)

### 1.2 Progress card: durable per-session status/plan, RPC + change event  [CONFIRMED-DOC]

Replaces transcript-scraping for "what is this agent doing?".

- Tool `progress_card { plan?, markdown? }` — one durable card per session, full replacement semantics.
  Plan ≤50 steps, step text ≤512 B, at most one `in_progress`; markdown ≤8192 B; inline `<progress>` bar
  supported (first bar pinned in hovercard). Invisible/bidi Unicode stripped before storing.
- **Gateway RPCs:** `progressCard.get` / `progressCard.put` with required `sessionKey` and optional `agentId`.
  Pass both for explicit agent selection (e.g. `{ "sessionKey": "global", "agentId": "research" }`).
- **Event:** `progressCard.changed` — notification is a refresh hint (a null revision is still only a hint;
  client confirms removal with a read/clear for that session+agent).
- **Capability negotiation:** Gateways advertise `progress-card-agent-scope-v1` in
  `hello.features.capabilities`. Independent clients must check it before sending `agentId`; without it,
  report that a Gateway update is needed. (Control UI itself skips negotiation.)
- **Pin to dashboard:** `dashboard` tool `action: "widget_put"`, `name: "session-progress"`,
  `pluginKind: "session:progress"`, `size: "md"`; omit `props.sessionKey` to follow the board's session.
- (`tools/progress-card.md`; also referenced by `tools/show-widget.md`, `web/control-ui/chat.md`)

### 1.3 Session observer digests, active-run IDs, and side chat  [CONFIRMED-DOC]

- **Event `session.observer`:** safe live headline + status digest. Model preamble can update the headline
  immediately; a utility model replaces it later. Payload has optional `sessionId` and opaque
  `lifecycleRevision` (absent before first reset; increases across runs; can restart after a reset).
  **Clients show the headline/inspector link only while the digest's exact `runId` is present in
  `activeRunIds`** — aggregate activity alone is not enough. (`gateway/protocol/rpc-bootstrap-and-events.md`,
  `gateway/clients.md`)
- **Active-run semantics (critical for clawsprawl's run indicators):** `sessionInfo.hasActiveRun` is the
  authoritative *aggregate*. `activeRunIds` (when present) is the *complete exact set*; `[]` proves idle.
  Snapshot omission = identities unavailable; delta omission = no change; delta `null` = tombstone that
  clears cached exact ids; array = replace. Correlate only run ids you own/received. There is a full
  per-client "Active-run cache matrix" (Web/Android/Apple rows) in `gateway/clients.md`.
- **Reconnect recipe (documented):** re-establish `sessions.subscribe` (with list params), re-subscribe
  `sessions.messages.subscribe`, `chat.history` for the session, adopt `inFlightRun` (`runId`, `text`, `plan`),
  then reconcile `agent` events by `payload.runId` + `payload.seq` (per-run sequence; forward gap ⇒ reload history).
- **Side chat / rail:** `/btw` or `/side` open a read-only rail thread backed by `sessions.companion.*`
  RPCs; `sessions.observer.ask` was **removed** in favor of `sessions.companion.ask`.
  (`tools/btw.md`, `gateway/protocol/handshake.md`)
- **Event `session.approval`:** sanitized pending/terminal approval truth for an explicitly opted-in exact-session
  subscriber (`sessions.messages.subscribe` with `includeApprovals: true`; per-call, not sticky; requires
  `operator.admin` or `operator.approvals` on a paired device).

### 1.4 Client capability registry + UI command fan-out  [CONFIRMED-DOC]

clawsprawl must advertise, in `connect.params.caps`, what it can render — several features are
capability-gated with **no handshake error** if omitted.

- **Capability registry** (`GATEWAY_CLIENT_CAPS` in `@openclaw/gateway-protocol/client-info`):
  `agent-kind`, `approvals`, `exec-approvals`, `inline-widgets`, `plugin-approvals`, `run-tool-bindings`,
  `session-scoped-events`, `task-suggestions`, `terminal-offset-seq`, `tool-events`, `ui-commands`,
  `usage-refreshing`. (`gateway/clients.md`, `gateway/protocol/handshake.md`)
- `tool-events` gates **live tool-execution streaming**; without it the connection receives no live tool
  events and the handshake does not report an error.
- `inline-widgets` gates `show_widget` tool availability to the originating client.
- `usage-refreshing` lets a cold `usage.status` return immediately with `refreshing: true` + empty provider
  list (client must keep it cache-cold and refetch on a short bounded schedule).
- **`ui.command` / `screen` tool:** typed layout+navigation commands (`split_right`, `split_down`,
  `close_pane`, `focus`, `navigate`, `sidebar_show/hide`, `terminal_show/hide`, `browser_show/hide`).
  Success returns `{ "ok": true }` after the Gateway broadcasts the typed `ui.command` event.
  Protocol v1 fans out to **every** connected Control UI advertising `ui-commands` (not targeted at one tab).
  RPC requires `operator.write`. (`tools/screen.md`; `board.command` reuses the same pattern.)
- `hello-ok.features.capabilities` also advertises additive wire contracts; e.g. native clients send
  `sessionKey` in `chat.metadata` only when `session-scoped-chat-metadata` is present, otherwise they retain
  the stable `v2026.7.1-2` agent-only behavior. (`gateway/protocol/presence.md`)

### 1.5 Portals, public transcripts, mentions/notifications, and Cloud Workers  [CONFIRMED-DOC]

Adoptable surfaces beyond chat:

- **Portals** (`gateway/portals.md`): expose an agent-run dev server (Gateway host or node-backed cloud
  worker) through the Gateway; proxies HTTP **and** WebSockets (HMR/live reload), served under
  **Control UI → Portals** (`/portals` route, `web/urls.md`). Declared via committed
  `.openclaw/portals.json` (`name`, `command`, `port`, optional `cwd`/`title`/`description`/`path`).
  App must honor `PORT`; `PUBLIC_URL` provided. Tool `portal` is `group:ui` + `coding` profile, blocked for
  HTTP `POST /tools/invoke`, restricted to session owner; **no dedicated config key** (deny via
  `tools.deny: ["portal"]`). Each portal gets its own origin/port + an `oc_portal_<instance>_` cookie prefix
  (HttpOnly token cookie; app cookies prefixed and `Domain` stripped). Worker portals use single-use tickets
  over the node's TLS-pinned WS. Caveat: portals bind the same interfaces as the Gateway (a LAN/tailnet-bound
  Gateway publishes those ports too).
- **Public session transcripts** (`web/urls.md`): `Public access → Enable` publishes a revocable read-only
  transcript at `/share/session?token=<opaque>`; page shows user msgs + assistant final answers (Markdown);
  omits tools, reasoning, files, images, executable widgets, internal metadata. Refreshes every 15 s,
  **Older messages** paging, no JS required for initial page. Token is an encrypted bearer capability bound to
  the Gateway installation identity (survives full backup/restore, not agent-DB-only restore). Social preview
  link is separate: `/share/dashboard/...`, `/share/session/...` + `/share/card.png` (1200×630, no session state).
  Behind a login proxy, allow anonymous GET/HEAD **only** to the `/share/*` namespace.
- **Mentions + notifications** (`web/webchat.md`, `web/notifications.md`): RPCs `users.mentionable`,
  `mentions.list`, `mentions.dismiss`, and event `mentions.changed` (revision invalidations) — all
  `operator.read`, authenticated-profile scoped. Browser **Web Push** RPCs: `push.web.vapidPublicKey`,
  `push.web.subscribe`, `push.web.unsubscribe`, `push.web.test`; VAPID keys + subscriptions live in
  `state/openclaw.sqlite`. Approval notifications deep-link to `/approve/<approvalId>`.
- **Cloud Workers + suspension** (`gateway/external-apps.md`, `gateway/cloud-workers.md`): cooperative host
  suspension RPCs `gateway.suspend.prepare` (`operator.admin`), `gateway.suspend.status` (`operator.read`),
  `gateway.suspend.resume` (`operator.admin`), `gateway.suspend.handoff` (`operator.admin`); hello snapshot
  carries `suspension: { phase }` and `gateway.suspension` events publish admission changes
  (`accepting|preparing|draining|prepared`). Session rows gain a closed `placement` state
  (`local|requested|provisioning|syncing|starting|active|draining|reconciling|reclaimed|failed`) plus machine
  metadata. `/readyz` returns 503 while draining; `/healthz` stays live.

---

## 2. AUTH / SECURITY MODEL CHANGES THAT MATTER

### 2.1 Auth modes and where they are enforced  [CONFIRMED-DOC]

- Gateway auth is enforced **at the WebSocket handshake**, before device pairing. Direct loopback does
  **not** bypass token/password. (`web/dashboard.md`, `web/control-ui.md`)
- Modes: `none` (private ingress only), `token` (default), `password`, `trusted-proxy`.
  `gateway.auth.mode` selects the configured secret, **not** the required wire field — the shared secret is
  accepted in `connect.params.auth.token` *or* `.password`. (`gateway/tailscale.md`, `gateway/protocol/auth.md`)
- If token mode has no credential, loopback startup generates a **runtime-only** token not written to config
  (unrecoverable; `openclaw doctor --generate-gateway-token` + restart to fix). (`web/dashboard.md`)
- `gateway.tailscale.mode: "funnel"` refuses to start unless auth mode is `password`.
- **Trusted-proxy auth is mutually exclusive with a shared token**: startup rejects trusted-proxy mode if
  `gateway.auth.token`/`OPENCLAW_GATEWAY_TOKEN` is also set. (`gateway/trusted-proxy-auth.md`)
- **Security audit flags trusted-proxy auth as CRITICAL** by design.

### 2.2 Tailscale Serve: managed ingress, identity headers, dedicated listener  [CONFIRMED-DOC]

(`gateway/tailscale.md`, `gateway/stable-https-url.md`, `web/control-ui/connect-and-pair.md`)

- `gateway.tailscale.mode`: `serve` | `funnel` | `off` (default). Serve keeps the Gateway on `127.0.0.1`
  and proxies via `tailscale serve`; Funnel is public and requires a shared password.
- **Managed ingress changed shape:** OpenClaw-managed Serve/Funnel now proxy to a **dedicated
  `127.0.0.1:<ephemeral-port>` listener** while ordinary local clients keep the configured port. Startup
  fails closed rather than sharing listener provenance, and holds Serve/Funnel as a **foreground Tailscale
  claim** (released automatically on stop).
- **Tailscale identity headers (Serve only):** when `gateway.auth.allowTailscale: true` (default-on for Serve
  with token auth), Control UI/WebSocket auth can use `tailscale-user-login`, verified by resolving the
  request's `x-forwarded-for` via local `tailscale whois`. Only qualifies on the dedicated managed-Tailscale
  listener with Tailscale's `x-forwarded-for/proto/host`. **Never** applies to `/v1/*`, `/tools/invoke`,
  `/api/channels/*` — those always use the normal HTTP auth mode.
- This tokenless path "assumes the gateway host is trusted"; if untrusted local code may run on the host, set
  `allowTailscale: false`.
- **`hello-ok.snapshot.controlUiIdentityUrl`** advertises the active Gateway's HTTPS dashboard URL when it
  uses trusted-proxy or Tailscale Serve identity. Operator clients can open it for personal browser sign-in
  **instead of forwarding shared device credentials**. Clients must use normal HTTPS trust (not native TLS
  pins) and must **never** send native connection tokens/passwords to it. Re-read per authenticated hello;
  discard on close. If the managed Serve route exits/replaced, the Gateway closes affected connections with
  code **1012**; reconnect to discover the current route.
- **`hello-ok.snapshot.controlUiUrl`** optionally advertises the configured public Control UI origin+basePath
  (omitted when `gateway.publicOrigin` unset or Control UI disabled); contains no credentials.
- Externally-managed Serve/Funnel routes are treated as generic `trusted-proxy` ingress (must be in
  `gateway.trustedProxies`, must rebuild `X-Forwarded-For`); this path does **not** grant `allowTailscale`.
- Named Tailscale **Services are not supported** by managed ingress (Tailscale requires persistent background
  routes). Existing `gateway.tailscale.serviceName` installs must run `openclaw doctor --fix`, which disables
  managed ingress and removes the key.
- Bind modes: `loopback` | `tailnet` | `lan` | `auto`. `tailnet` = direct Tailnet bind (no HTTPS/Serve) plus
  required local `127.0.0.1` when a Tailnet IPv4 exists. `auto` uses `0.0.0.0` in containers, else loopback.

### 2.3 Trusted-proxy auth: identityScopes, deviceAutoApprove, scopes header  [CONFIRMED-DOC]

(`gateway/trusted-proxy-auth.md`, `gateway/operator-scopes.md`)

- Config: `gateway.trustedProxies` (CIDR-aware, IPv4-mapped IPv6 accepted), `gateway.auth.mode: "trusted-proxy"`,
  `auth.trustedProxy.userHeader` (required), `requiredHeaders`, `allowUsers`, `allowLoopback` (default false).
- **Runtime rules, in order:** proxy attribution before auth (`proxy_attribution_required`); proxy must
  overwrite `X-Forwarded-For`; loopback sources rejected unless `allowLoopback` + loopback in `trustedProxies`
  (`trusted_proxy_loopback_source`); Gateway-host's own interface addresses rejected as spoof guard
  (`trusted_proxy_local_interface_source`); required headers present; `allowUsers` match.
- **`gateway.auth.identityScopes`** — per-verified-identity session-only operator scope grants
  (email keys case-insensitive; unknown scope names fail config validation). Applied only to `operator`-role
  connections; never `node`-role. Token/password/no-auth connections never receive them.
- **`trustedProxy.deviceAutoApprove`** (default off) — proxy identity becomes the approval boundary for new
  browser/native UI operator devices + same-key scope upgrades. Default scopes
  `["operator.read","operator.write","operator.approvals","operator.questions"]`. Listing `operator.admin`
  triggers CRITICAL `gateway.trusted_proxy_device_auto_approve_admin` audit finding + startup warning.
- **`x-openclaw-scopes` header** (trusted-proxy HTTP + cap on Control UI WS upgrade): present = honors declared
  set; present-but-empty = **no** scopes; absent = default operator set for identity-bearing HTTP APIs, but
  **gateway-auth plugin HTTP routes fall back to `operator.write` only**. On WS upgrade it is a **cap**, never
  a grant; with `deviceAutoApprove.enabled` it also caps the persistent device grant.
- **Retired:** `gateway.controlUi.dangerouslyDisableDeviceAuth` is ignored and removed by `openclaw doctor --fix`.
  The retired Control UI upgrade input no longer grants temporary access to arbitrary `client.mode: "backend"`
  or CLI-shaped clients. Custom automation must use device identity/pairing, the reserved direct-loopback
  `client.id: "gateway-client"` backend helper path, or the Admin HTTP RPC plugin.

### 2.4 Named operator roles (team gateways)  [CONFIRMED-DOC]

(`gateway/operator-scopes.md`)

- New `gateway.roles` config: `default` + `definitions.<role>` combining four closed policies —
  `sessions.others` (`none|view|suggest|write`), `agents` allowlist (`"*"` or ids or `[]`), a maximum
  operator `scopes` ceiling, and `sandbox: "inherit"|"required"`.
- Assigned via admin `users.setRole { profileId, role }` (`role: null` clears). Assignment changes
  **immediately invalidate and close that profile's active connections**.
- **When roles are configured, identity-authenticated operator connections do NOT receive reusable device or
  bootstrap tokens** (they are not bound to a person and could bypass the ceiling). Device-token/bootstrap-token
  auth without verified user identity is rejected for operator WS + HTTP. Node connections, shared-secret/
  password access, and role-less Gateways keep existing behavior.
- Per-identity admin should use `identityScopes` rather than persistent admin device grants.
- Role ceiling intersects connection auth, identity grants, pairing, scope upgrades, and trusted-proxy HTTP;
  it only filters, never adds.

### 2.5 Control UI origin, CSP, embed sandbox, and public origin  [CONFIRMED-DOC]

- `gateway.controlUi.allowedOrigins`: explicit browser-origin allowlist for Gateway WS connects; **required
  for public non-loopback browser origins**. Private same-origin LAN/Tailnet UI loads from loopback,
  RFC1918/link-local, `.local`, `.ts.net`, or Tailscale CGNAT are accepted without Host-header fallback.
  (`gateway/config-gateway.md:175`, `gateway/tailscale.md`)
- `gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback` (dangerous mode) exists; audit flags wildcard/
  missing `allowedOrigins` and Host-header fallback.
- `gateway.controlUi.embedSandbox`: `strict` | `scripts` (default) | `trusted`. `trusted` adds
  `allow-same-origin` on top of `allow-scripts`.
  `gateway.controlUi.allowExternalEmbedUrls: true` needed for absolute external `http(s)` `[embed url=...]`.
  (`web/control-ui/chat.md`)
- `gateway.controlUi.enabled` **hot-applies**; changing base path or asset root still needs a restart.
- `gateway.publicOrigin`: externally reachable HTTPS origin; drives copied session links, social-card URLs,
  and approval-link `#gatewayUrl=` fragments. **Required** for a single installed PWA that switches among
  multiple Gateways (each must also share the same VAPID keypair).
- **Runtime config endpoint:** Control UI fetches `/control-ui-config.json` relative to its base path
  (e.g. `/__openclaw__/control-ui-config.json`), **gated by gateway HTTP auth** — unauthenticated browsers
  cannot fetch it. Tailscale header auth does **not** apply to this HTTP endpoint (WS only).
  (`web/control-ui/connect-and-pair.md`)
- **Automatic browser handoff:** after a failed auth, Control UI makes one same-origin request to
  `GET /.well-known/openclaw/browser-bootstrap` (under base path). Response
  `{ "bootstrapToken": "...", "bootstrapProfile": "owner" }`, `Content-Type: application/json`,
  `Cache-Control: no-store`, reject cross-origin; UI rejects redirects, >8 KiB responses, tokens >4096
  printable ASCII; 45-second deadline. Host must independently verify identity and use
  `openclaw dashboard --json`. (`web/dashboard.md`)
- `openclaw dashboard` issues a **short-lived single-use bootstrap** bound to that browser's signed device
  identity instead of putting the shared token in the launch URL. Token-mode secrets are kept in
  **sessionStorage** (tab + Gateway origin); passwords stay in memory.

### 2.6 Device identity, pairing, and TLS pinning  [CONFIRMED-DOC]

(`gateway/protocol/auth.md`, `gateway/clients.md`, `web/control-ui/connect-and-pair.md`)

- Pre-connect challenge: `connect.challenge` event with `{ nonce, ts }`. A received WS challenge without a
  non-negative integer `ts` is **invalid**. Use `payload.ts` as `device.signedAt`; send the same nonce in
  `device.nonce`. Preferred signature payload is **v3** (`buildDeviceAuthPayloadV3`, binds `platform` +
  `deviceFamily`); legacy v2 still accepted.
- Device-auth migration diagnostics: `DEVICE_AUTH_NONCE_REQUIRED`, `_NONCE_MISMATCH`, `_SIGNATURE_INVALID`,
  `_SIGNATURE_EXPIRED`, `_DEVICE_ID_MISMATCH`, `_PUBLIC_KEY_INVALID` with stable `details.reason` values.
- Auth error hints: `error.details.canRetryWithDeviceToken`, `error.details.recommendedNextStep` ∈
  {`retry_with_device_token`,`update_auth_configuration`,`update_auth_credentials`,`wait_then_retry`,
  `review_auth_configuration`}. `AUTH_TOKEN_MISMATCH` ⇒ one bounded trusted retry with cached device token
  (loopback or `wss://` with pinned `tlsFingerprint` only). `AUTH_SCOPE_MISMATCH` ⇒ re-pair, not rotate token.
- Operator scope set (closed): `operator.read`, `.write`, `.admin`, `.approvals`, `.questions`, `.pairing`,
  `.talk`, `.talk.secrets`. `operator.write` satisfies `operator.talk`/`operator.read`. Unknown future
  `operator.*` scopes need exact match unless caller holds `operator.admin`.
- Setup-code bootstrap returns the primary node token plus a **bounded** operator token
  (`operator.approvals`, `operator.read`, `operator.talk.secrets`, `operator.write`; no pairing/admin).
  Persist `hello-ok.auth.deviceTokens` only over `wss://` or loopback/local pairing.
- Direct loopback connects with no forwarded/proxy headers auto-approve device pairing **after** gateway auth
  succeeds and the browser presents device identity. Tailnet/LAN browser connects still need explicit approval.
- `openclaw devices list` / `approve <requestId>` / `revoke` / `remove`; scope or role upgrades create a
  **new** pending pairing request; token rotation cannot expand the approved contract.
- TLS: `gateway.tls` for WS; optional pin via `gateway.remote.tlsFingerprint` or CLI `--tls-fingerprint`.
- `gateway.auth.identityScopes` grants are session-only and do not create pairing records.

---

## 3. WEBCHAT / CONTROL UI PROTOCOL CHANGES AFFECTING A CUSTOM WEBCHAT-COMPATIBLE CLIENT

### 3.1 Wire protocol version 4 — explicit breaking contract  [CONFIRMED-DOC]

(`gateway/clients.md`, `gateway/protocol/versioning.md`, `gateway/protocol/transport.md`)

- Current wire version is **4**. General operator/WebChat clients must negotiate the **exact** current version:
  `minProtocol: 4`, `maxProtocol: 4`. Only authenticated **node** clients and lightweight probes have the
  N-1 window (3→4).
- Protocol changes are additive first; **a wire-version bump is an explicit breaking event for third-party
  clients**. Pin tested versions, upgrade client+Gateway together.
- Frames: request `{type:"req", id, method, params, traceparent?}`; response `{type:"res", id, ok, payload|error}`;
  event `{type:"event", event, payload, seq?, stateVersion?}`. Pre-connect frames capped at 64 KiB
  (`MAX_PREAUTH_PAYLOAD_BYTES`); after handshake honor `hello-ok.policy.maxPayload` / `.maxBufferedBytes`.
- `permessage-deflate` offered; frames ≥4 KiB compressed; **payload limits apply to the inflated size**.
- Optional W3C `traceparent` per request after auth (≤128 chars; malformed ⇒ fresh trace, no failure).
- Structured errors: `{ code, message, details?, retryable?, retryAfterMs? }`. Missing scope ⇒ top-level
  `code: "FORBIDDEN"` with `details.code: "MISSING_SCOPE"`, `missingScope`, `requiredScopes`; HTTP mirror is
  status **403** with the same object under `error.details`. Legacy `missing scope: <scope>` message retained.
- Bounded per-connection RPC start queue; retryable `UNAVAILABLE` when saturated; **responses can arrive out
  of order** (started requests complete concurrently). Side-effecting methods require idempotency keys.
- Tick: default pre-`hello-ok` 30 s; server advertises `policy.tickIntervalMs`; client closes with code
  **4000** after silence > `tickIntervalMs * 2` and **does not replay** rejected requests.
- Client constants: request timeout 30 000 ms, preauth/connect-challenge timeout 15 000 ms, reconnect backoff
  1 000→30 000 ms, fast-retry clamp 250 ms, `MAX_PAYLOAD_BYTES` 25 MiB, chat attachment ceiling = decoded
  `agents.defaults.mediaMaxMb` (default 20 MB) with images capped at `min(ceiling, 6 MB)`.
- Startup: `connect` can return retryable `UNAVAILABLE` with `details.reason: "startup-sidecars"` +
  `retryAfterMs`, then closes with code **1013** / reason `gateway starting`.
- Shutdown: `shutdown` event with `reason` + optional `restartExpectedMs`; close code **1012** for both
  restart and terminal shutdown (close code/reason do not distinguish — use the event payload).

### 3.2 Chat/transcript contract changes  [CONFIRMED-DOC]

(`gateway/protocol/rpc-session-control.md`, `gateway/protocol/rpc-bootstrap-and-events.md`, `web/webchat.md`)

- **`chat` event delta shape (protocol v4):** delta payloads carry `deltaText`; `message` remains the
  cumulative assistant snapshot. Non-prefix replacements set `replace=true` and use `deltaText` as the
  replacement text. Failed runs (`state: "error"`) may carry `errorDetail` (7 optional sanitized provider
  fields; ≤300 chars; `httpStatus` 100–599; credential-redacted) alongside coarse `errorKind`/`errorMessage`.
- **`chat.history`** is display-normalized: strips inline directive tags (`[[reply_to_*]]`, `[[audio_as_voice]]`),
  plain-text tool-call XML payloads, leaked model control tokens; omits pure `NO_REPLY`/`no_reply` rows.
  Oversized rows can be replaced with `[chat.history omitted: message too large]`. Per-request `maxChars`
  override; paginated requests also accept a `maxBytes` page target.
- **`chat.message.get`** (additive) — bounded full-message reader for one visible transcript entry by
  `sessionKey` (+ optional `agentId`) and `messageId`; same display normalization, no lightweight truncation cap.
- **`chat.startup`** — opens a chat with a small recent-history page; short chat links resolve in the same
  request; short-reference startup subscribes the connection to session events **before** reading history.
- **`chat.history` `__openclaw` metadata envelope:** `id` (transcript entry identity — use for anchored
  requests, not as a unique display key), `seq` (positive transcript-record sequence; one record may project
  into multiple rows), `kind` (`"compaction"` with optional `tokensBefore/tokensAfter`; `"reset"` with none).
  Page with `hasMore`/`nextOffset`; **do not persist numeric offsets** across reset/compaction — persist
  `__openclaw.id`. Anchored responses omit numeric paging metadata.
- **`deltaCursor` tail catch-up:** tail responses can include an opaque `deltaCursor`; pass it back as `cursor`
  to `chat.history`/`chat.startup` instead of `offset`/`messageId`. Success
  `{ kind: "delta", messages, deltaCursor, sessionInfo }` — replay each entry through the same reducer as a live
  `session.message` payload. `{ kind: "reset" }` means invalid/stale/other-session/crossed reset or compaction/
  too far behind ⇒ fetch a normal tail page. Catch-up never returns a partial page: >200 raw events or the
  1 MB payload budget resets to a tail fetch.
- **Admission ≠ persistence:** `chat.send`/`sessions.send`/`sessions.create` acks report admission separately.
  `status: "started"` and `runStarted: true` alone do **not** establish a transcript row. Optional `messageSeq`
  comes only from a committed user-turn receipt. Reconcile provisional input by submission identity.
- **Idempotency:** `chat.send` takes an idempotency key (Control UI uses the run id); same key returns
  `{status:"in_flight"}` while running, `{status:"ok"}` after completion. Reusing the key with different
  mention selections is rejected.
- **`expectedLeafEntryId`** on non-steer interactive sends = transcript-branch compare-and-swap; mismatch ⇒
  `details.reason: "active-leaf-changed"`. Steer sends ignore it.
- **`queueMode`** per request: `steer` | `followup` | `collect` | `interrupt`. `sessions.steer` is a
  **deprecated alias** for `chat.send` with `queueMode: "interrupt"`.
- **Human mentions:** `chat.send` / initial `sessions.create` / `sessions.send` accept `mentions` array of
  `{ profileId, start, end }` (≤10; `start` inclusive, `end` exclusive, UTF-16 code units). Plain `@name`
  text does not create mentions.
- **`artifacts.download`** for generated images: call with `sessionKey`, optional `agentId`, and the block's
  stable `artifactId`; use the returned short-lived `url` before `expiresAt`. URL is scoped to that exact
  transcript-backed artifact and carries no reusable credential. Fetch from the Gateway origin with the same
  TLS pin/proxy headers; validate as image; 12 MiB source limit + bounded decoded thumbnail. Retry once on
  expiry; reconnect/route change cancels the load. Do **not** persist downloaded bytes or temp URLs.
- **Aborted runs** keep partial assistant text; Gateway persists buffered partial text with abort metadata.
- **Retired config:** legacy `channels.webchat` and `gateway.webchat` sections are retired —
  `openclaw doctor --fix` removes them. WebChat has **no persisted config section** now.
- **Retired option:** `gateway.controlUi.toolTitles` is retired; `openclaw doctor --fix` removes it.

### 3.3 Session control surface (new/changed)  [CONFIRMED-DOC]

- `sessions.subscribe` accepts the same params as `sessions.list` and returns `{ subscribed: true, list }`
  in one round trip (`{}` ⇒ ack only). Subscription is registered **before** the snapshot is projected, so
  events can arrive first — track bootstrap-time changes and issue a trailing `sessions.list` refresh.
- `sessions.list` / `sessions.subscribe` accept `activeOnly: true` (live runtime owners, not stored status)
  and `ownerFirst: true` (prepends ≤60 viewer-owned rows, offset 0 only, dedupe by session key; viewer identity
  comes from the authenticated connection, never a client-supplied id).
- `sessions.messages.subscribe` / `.unsubscribe` with `includeApprovals: true` for `session.approval`
  events + bounded `approvalReplay`.
- Session rows now carry: `agentRuntime`, `placement` + state-specific env/owner-epoch/workspace/bundle/
  ACK-cursor/recovery fields, `providerId`/`profileId`/`machine`, advisory `diskSpace`, `runner`
  (`{kind:"device",status,deviceId?}`), ownership projections (`createdActor` write-once, mutable `owner`
  with `assignedBy`/`assignedAt`, bounded `participants` ≤4 + full `participantCount`), `parentSessionKey`,
  `controlOwnerSessionKey`, `forkSource`, `previousSessionId`, `worktree {id,branch,repoRoot}`.
- New/changed methods: `sessions.resolve`, `sessions.describe`, `sessions.preview`, `sessions.title.prepare`,
  `sessions.assignOwner`, `sessions.groups.list|put|rename|delete|defaults|update`,
  `sessions.dispatch`, `sessions.reclaim`, `sessions.move`, `sessions.abort` (with `clearQueued`),
  `sessions.patchMany`, `sessions.rewind`, `sessions.fork`, `sessions.branches.list|switch`, `sessions.diff`,
  `sessions.files.get|set`, `artifacts.download`.
- **Archive/restore requires** caller-observed `expectedSessionId`; a cancellation/drain/persistence failure
  returns retryable `UNAVAILABLE` and leaves the session unarchived.
- **Spawn lineage is no longer publicly patchable** (`spawnedBy`, `spawnedWorkspaceDir`, `spawnedCwd`,
  `spawnDepth`, `subagentRole`, `subagentControlScope`) — requests still sending them are rejected.

---

## 4. DOC-STATED BREAKING / REMOVED PROTOCOL SURFACES (checklist for clawsprawl)

| Item | Doc-stated change | Source |
|---|---|---|
| Wire version | Must negotiate exactly 4 (`min=max=4`) for operator/WebChat clients; N-1 window is node/probe only | `gateway/clients.md` |
| `chat` deltas | v4 delta payloads use `deltaText`; `replace=true` for non-prefix replacements | `gateway/protocol/rpc-bootstrap-and-events.md` |
| `sessions.observer.ask` | **Removed** → use `sessions.companion.ask` | `gateway/protocol/handshake.md` |
| `execSecurity` / `execAsk` | Retired from runtime policy; still in v4 schemas but requests containing them (even `null`) ⇒ `INVALID_REQUEST`; use `permissionMode` or `/exec` | `tools/exec.md`, `gateway/permission-modes.md` |
| `sessions.patch` spawn lineage fields | No longer publicly patchable | `gateway/protocol/rpc-session-control.md` |
| `sessions.steer` | Deprecated alias for `chat.send` + `queueMode:"interrupt"` | `gateway/protocol/rpc-session-control.md` |
| `chat.toolTitles` | Deprecated; validates shape then returns `{titles:{}, disabled:true}` | `gateway/protocol/rpc-session-control.md` |
| Canvas node handshake | `canvasHostUrl` / `canvasCapability` / `node.canvas.capability.refresh` **not supported**; use `pluginSurfaceUrls` + `node.pluginSurface.refresh` | `gateway/protocol/handshake.md` |
| Legacy Control UI upgrade input | Retired; no temporary access for arbitrary `client.mode:"backend"`/CLI-shaped clients | `gateway/trusted-proxy-auth.md` |
| `gateway.controlUi.dangerouslyDisableDeviceAuth` | Ignored; removed by `openclaw doctor --fix` | `gateway/trusted-proxy-auth.md` |
| `gateway.controlUi.toolTitles` | Retired; removed by doctor | `web/control-ui/feature-reference.md` |
| `channels.webchat` / `gateway.webchat` | Retired config; removed by doctor; no persisted WebChat config section | `web/webchat.md` |
| `extensions/workspaces` + `workspace_*` + Workspaces tab/CLI | **Deleted**; doctor deletes legacy `<stateDir>/workspaces/` with **no import** | `web/dashboard-architecture.md` |
| Session pins | Restricted to **root** sessions; existing child pins disappear; child/subagent sessions reject pin requests | `web/control-ui/feature-reference.md`, release 2026.9.3 notes |
| Control UI URL forms | `?view=terminal` ⇒ `/focus/terminal`; `?face=dashboard` ⇒ `/dashboard`; `?session=` migration-only for chat; dashboards gallery at `/dashboards` | `web/urls.md` |
| `chat.history` shape | Bounded/truncated; directive tags + tool-call XML + control tokens stripped; `NO_REPLY` rows omitted | `web/webchat.md`, `gateway/protocol/rpc-session-control.md` |
| Missing scope errors | Structured `FORBIDDEN` + `details.code: MISSING_SCOPE` (+ `requiredScopes`); HTTP 403 mirror | `gateway/protocol/transport.md` |
| Named roles | With `gateway.roles` configured, identity-authed operator connections get **no** reusable device/bootstrap tokens; token-only operator auth rejected | `gateway/operator-scopes.md` |
| `gateway.tailscale.serviceName` | Unsupported by managed ingress; doctor disables managed ingress and removes the key | `gateway/tailscale.md` |
| Trusted-proxy + shared token | Startup **rejects** both together | `gateway/trusted-proxy-auth.md` |
| `cron.webhook` legacy key | Retired; rejected by validation; doctor migrates `notify: true` jobs | `web/control-ui/feature-reference.md` |
| `gateway.tailscale.preserveFunnel` | Deprecated migration guard | `gateway/tailscale.md` |
| `tools.experimental.planTool` | Moved to `tools.updatePlan` (doctor) | `gateway/config-tools/built-in-tools.md` |

---

## 5. EXPERIMENTAL / BETA SURFACES (stabilizing?)

**[CONFIRMED-DOC]** Currently documented experimental flags (`concepts/experimental-features.md`):

| Surface | Key | Notes |
|---|---|---|
| Local model runtime | `agents.defaults.experimental.localModelLean` | removes browser/automations/message/image_generate/music_generate/video_generate/tts/pdf |
| Codex harness | `plugins.entries.codex.config.appServer.experimental.sandboxExecServer` | native Codex app-server 0.143.0+ |
| Code Mode | `tools.codeMode.enabled` | Labs switch writes `"auto"` (only preferred models) |
| Cloud workers desktop | `cloudWorkers.desktop` | watch/control desktop-capable workers from Control UI |
| Custom plugin UI | `gateway.controlUi.experimental.customPlugins` | default **off**; needs Gateway restart + tab reload; native UI runs with operator's Gateway authority |
| Swarm | `tools.swarm.enabled` | **enabled by default**, explicit opt-out |

- **[CONFIRMED-DOC]** All **plugin APIs are experimental** (including `feature-contract` / `feature-plugin` /
  `control-ui` browser contracts) — a feature plugin can register native Control UI pages, sidebar
  destinations, session panels, header accessories, **native dashboard widget views**
  (`registerWidget` + backend `registerControlUiDescriptor` with `surface:"widget"`), and **replacements**
  for `workspace`, `session-list`, `composer`, `transcript`, `tool-result`. (`plugins/feature-plugins.md`)
- **[CONFIRMED-DOC]** Control UI **Labs** (Settings → Agents & Tools → Labs) includes Code Mode, Swarm,
  Tool Search, Custom plugin UI, Tool-loop detection, Lean tools for local models, Message audit metadata,
  and Cloud Worker Desktop. Message audit metadata, Cloud Worker Desktop, and Custom plugin UI require a
  **Gateway restart**; Custom plugin UI also requires reloading browser tabs. (`web/control-ui/feature-reference.md`)
- **[CONFIRMED-DOC]** Fleet / multi-tenant hosting is **experimental** — commands, flags, and container
  profile can change between releases without a deprecation window. (`gateway/multi-tenant-hosting.md`)
- **[CONFIRMED-DOC]** Windows/Linux computer-use via the `cua-computer` plugin is experimental; Codex
  WebSocket transport remains experimental (`plugins/codex-harness/troubleshooting.md`).
- **[CONFIRMED-DOC]** SDK deprecations with dates: `agent-harness-credential-prompt-string-argument`
  entered deprecation 2026-09-09 (legacy string arg supported through 2026-11-30; pass
  `{ controlToolsAvailable }`); `sdk-untrusted-context-identifier-aliases` reached its 2026-09-08 removal
  date but remains `removal-pending`. (`CHANGELOG.md` 2026.9.4)
- **[CONFIRMED-DOC]** "Stabilized" signals: hot/restart reload modes retired in `v2026.7.2-beta.4`,
  **stable from v2026.8.1**, doctor maps both to `hybrid` (`gateway/index.md:118`). Tailscale managed
  ingress, web push, and named operator roles are documented as shipping features, not flags.

---

## 6. OTHER DASHBOARD-RELEVANT SURFACES (confirmed, worth knowing)

- **Health/readiness probes (unauthenticated GET/HEAD):** `/health`,`/healthz` (server live);
  `/startup`,`/startupz` (startup complete + not draining; `503 starting|draining`); `/ready`,`/readyz`
  (startup + channels pass deep readiness; `503` on broken channel). Remote unauthenticated startup/readiness
  bodies expose only `ok`/`status`; local/authenticated also get `version`, `uptimeMs`, `pendingReason`.
  (`gateway/health.md`)
- **Presence:** `system-presence` keyed by device identity with `deviceId`/`roles`/`scopes`; `node.list`
  includes `lastSeenAtMs`/`lastSeenReason` and `hostStats`; events `node.hostStats {nodeId, hostStats}`
  (`dropIfSlow: true`), `node.presence`. Node host stats payload = `cpuCount`, optional `loadAverage[3]`,
  `memoryTotalBytes/FreeBytes`, `diskTotalBytes/AvailableBytes`; Gateway stamps `updatedAtMs`.
  (`gateway/protocol/presence.md`)
- **Broadcast scope gating:** chat/agent/tool-result frames require ≥`operator.read`; `plugin.*` broadcasts
  default to `operator.write`/`operator.admin` (approval ones use `operator.approvals`); status/transport
  events (`heartbeat`, `presence`, `tick`, lifecycle) are unrestricted; unknown families fail closed.
  Each connection has its own monotonic sequence number. (`gateway/protocol/presence.md`)
- **Config/other events:** `config.changed` (path + new snapshot hash, never content), `skills.changed`
  (reason enum), `voicewake.changed`, `device.pair.requested|resolved`, `device.pair.setup.completed`,
  `device.pair.setup.deliveryUncertain`, `node.pair.requested|resolved`, `cron`, `health`, `shutdown`.
  (`gateway/protocol/rpc-bootstrap-and-events.md`)
- **HTTP surfaces:** OpenAI-compatible `/v1/*`, `/tools/invoke`, `/api/channels/*`, plus plugin HTTP routes
  and WebSocket upgrades. Admin HTTP RPC plugin exists for hosts that cannot speak WS
  (`plugins/admin-http-rpc.md`). (`gateway/external-apps.md`)
- **`hello-ok.policy.attachments`** (optional; older gateways omit): `{maxBytes, maxImageBytes}` = decoded
  per-attachment ceilings; re-read every reconnect. Attachments travel base64, so validate the serialized
  request against `policy.maxPayload` too.
- **Node camera / PTZ:** camera capture (`camera.list|snap|clip`) on iOS/Android/macOS/Linux; physical PTZ
  (`camera.ptz.status|control`) macOS USB UVC only, dangerous, disarmed until added to
  `gateway.nodes.commands.allow`. Node skills/tool descriptors publish via `node.skills.update` /
  `node.pluginTools.update`; disable with `gateway.nodes.allowSkills: false` /
  `gateway.nodes.pluginTools.enabled: false`. (`nodes/camera.md`, `gateway/protocol/handshake.md`)
- **Show widget tool:** inline widgets in Control UI + iOS/Android/macOS/Linux Quick Chat; requires
  `inline-widgets` capability or exactly one matching channel presenter; pinned-only scheduled surface for
  automations; wrapper injects `sendPrompt(text)` + `openclaw.prompt|state|data|action|cron` +
  `openclaw.host.controlUiBaseUrl`; size reporter clamps 48–8000 px; ≤10 prompts/rolling minute; `/`-prefixed
  prompts rejected; error reporter ≤3 messages/doc load, 500 UTF-16 units, 10 reports per key per 60 s.
  (`tools/show-widget.md`)

---

## 7. UNVERIFIED / NOT REACHABLE (explicitly separated)

- **[WEB-RUMOR/UNVERIFIED]** Web searches for "openclaw new features 2026.9", "openclaw control ui changes",
  "openclaw gateway websocket api", "openclaw 2026.9 release" **timed out** (provider request timeout) in
  this run. No search-derived claims are included above; every item is from official local docs or fetched
  docs.openclaw.ai pages.
- **[WEB-RUMOR/UNVERIFIED]** `https://docs.openclaw.ai/CHANGELOG` returned **404** ("not in the current
  published bundle"). Use `/releases` (index) or `/releases/<version>` instead, or the GitHub changelog
  index `https://github.com/openclaw/openclaw/blob/main/CHANGELOG.md` (linked from `/releases`).
- **[WEB-RUMOR/UNVERIFIED]** Local `CHANGELOG.md` in the installed 2026.9.4 package contains **only** the
  2026.9.4 section; I did not verify older versions' entries locally. Anything about 2026.7.x/2026.8.x
  specific *fix lists* beyond the release-note highlights above is unverified here.
- **[WEB-RUMOR/UNVERIFIED]** Third-party blog posts, Reddit/Discord chatter, or non-openclaw.ai summaries
  were not consulted. Do not treat any claim outside this file's sourced lines as documented.

---

## 8. QUICK ADOPTION CHECKLIST FOR clawsprawl

1. Negotiate wire v4 exactly (`minProtocol: 4`, `maxProtocol: 4`); pin `@openclaw/gateway-protocol` and
   `@openclaw/gateway-client` to tested versions (docs currently pin `2026.8.1`).
2. Implement `connect.challenge` → v3 device signature; persist `hello-ok.auth.deviceToken` per device+role.
3. Advertise `caps` honestly: at minimum `tool-events` for live tool streaming, `inline-widgets` if you render
   widgets, `ui-commands` only if you honor `ui.command` fan-out, `usage-refreshing` if you cache usage cold.
4. Read `hello-ok.policy.*` (maxPayload, maxBufferedBytes, tickIntervalMs, attachments) each reconnect.
5. Use `sessions.subscribe` (with list params) + `chat.history` + `inFlightRun` + `activeRunIds` semantics.
6. Use `progressCard.get`/`progressCard.put` + `progressCard.changed` for status; check the
   `progress-card-agent-scope-v1` capability before sending `agentId`.
7. If you render dashboards: `board.get`/`board.update` + `board.changed`; native `session:report` needs no
   iframe; HTML/MCP widgets need the sandboxed dedicated-origin host with ticket-bound bridges.
8. Resolve images via `artifacts.download` with short-lived URLs; never store bytes or temp URLs.
9. Handle `1012` (restart vs shutdown — read the `shutdown` event payload), `1013` (`startup-sidecars`
   retryable), `4000` (tick timeout; do not replay), and structured `MISSING_SCOPE`/`FORBIDDEN`.
10. Auth: prefer `controlUiIdentityUrl` for human sign-in over forwarding device credentials; never send
    native tokens to it. Keep the shared secret in memory/session storage only.
