# Operations Runbook

## Runtime Topology

```mermaid
flowchart LR
  Browser[Browser UI] -->|fetch + SSE| Server[ClawSprawl SSR Server]
  Server -->|WebSocket v3| Gateway[OpenClaw Gateway\nws://localhost:18789/ws]
  Gateway --> Providers[Model Providers]
  Gateway --> Jobs[Cron / Automation]
```

The Astro SSR server holds the gateway token and maintains the persistent WebSocket connection. The browser connects to the SSR server via HTTP and SSE — no gateway token or direct gateway access is needed in the browser.

## Quick Ops Commands

```sh
npm run ops -- status
npm run ops -- qa-strict
npm run ops -- tmux-up --profile private-local
npm run ops -- tmux-up --profile-file /path/to/private-profile.ts
npm run ops -- dev --profile-file /path/to/private-profile.ts
npm run ops -- start
```

`--profile-file` copies your profile to `src/config/profiles/private.local.ts` and auto-selects the profile id found in that file (unless `--profile` is explicitly passed).

## Runtime Mode

ClawSprawl uses a single **SSR mode**:

1. The Astro SSR server starts and connects to the OpenClaw gateway via WebSocket
2. The server authenticates using `OPENCLAW_GATEWAY_TOKEN` from the environment
3. The server caches RPC responses and buffers gateway events
4. The browser fetches `/api/public/dashboard.json` for public snapshots and `/api/public/events` for snapshot invalidation SSE
5. In `CLAWSPRAWL_MODE=token`, optional private unlock posts `CLAWSPRAWL_PRIVATE_TOKEN` to `/api/private/session` and upgrades the same page with cookie-backed `/api/private/*` routes
   - private cookie lifetime is browser-session scoped, with server-side expiry capped by `CLAWSPRAWL_SESSION_MAX_AGE_HOURS` (max 24h)
6. In `CLAWSPRAWL_MODE=insecure`, private cards are enabled without a token and must remain on a private network only

## Start Services

1. Configure environment:

```sh
# Set your gateway token (server-side only)
export OPENCLAW_GATEWAY_TOKEN=<your-token>

# Choose access mode
export CLAWSPRAWL_MODE=token

# Optional in token mode: enable private dashboard unlock
export CLAWSPRAWL_PRIVATE_TOKEN=<your-private-bearer-token>

# Optional in token mode: cap private session lifetime (max 24 hours)
export CLAWSPRAWL_SESSION_MAX_AGE_HOURS=24
```

2. Development:

```sh
npm run dev
```

3. Production:

```sh
npm run build
npm run start
```

### Container runtime

Pull and run release image from GHCR:

```sh
docker pull ghcr.io/johndotpub/clawsprawl:v0.42.0

docker run --rm -p 4321:4321 \
  -e OPENCLAW_GATEWAY_TOKEN=<your-token> \
  -e OPENCLAW_GATEWAY_WS_URL=ws://127.0.0.1:18789/ws \
  -e OPENCLAW_GATEWAY_HTTP_URL=http://127.0.0.1:18789 \
  -e CLAWSPRAWL_MODE=token \
  -e CLAWSPRAWL_PRIVATE_TOKEN=<your-private-bearer-token> \
  -e CLAWSPRAWL_SESSION_MAX_AGE_HOURS=24 \
  ghcr.io/johndotpub/clawsprawl:v0.42.0
```

For private-network-only public dashboards:

```sh
docker run --rm -p 4321:4321 \
  -e OPENCLAW_GATEWAY_TOKEN=<your-token> \
  -e CLAWSPRAWL_MODE=public \
  ghcr.io/johndotpub/clawsprawl:v0.42.0
```

## API Endpoints

The SSR server exposes these API routes:

- `GET /api/public/dashboard.json` — cached public-safe snapshot for unauthenticated viewers
- `GET /api/public/events` — public snapshot invalidation SSE plus keepalive ping
- `POST /api/private/session` — validate `Authorization: Bearer <CLAWSPRAWL_PRIVATE_TOKEN>` and create private session cookie in token mode
- `DELETE /api/private/session` — clear private-view session cookie
- `GET /api/private/dashboard.json` — full authenticated snapshot for private cards
- `GET /api/private/events` — authenticated raw gateway SSE stream for private activity surfaces
- `GET /api/private/health.json` — authenticated connection health endpoint
- `GET /api/dashboard.json`, `/api/events`, `/api/health.json` — deprecated legacy routes returning `410`

Public usage panel data combines:
- `usage.cost` (totals + daily rollups)
- `usage.status` (provider quota/remaining summary)

## Incident Triage

### Gateway unreachable

- Check that the OpenClaw gateway is running on the expected host/port.
- Validate `OPENCLAW_GATEWAY_TOKEN` is set correctly in the SSR server environment.
- If private view is enabled, check `/api/private/health.json` for connection state and error counts.
- Use Retry Connection button in dashboard after fix.
- Check stale badge and reconnect/error counters for incident duration and severity.

### Cron failures: Unknown Channel

- Verify Discord channel routing in OpenClaw state/config.
- Confirm cron runs in gateway (`cron.runs`) show improved status after channel fix.
- Use dashboard cron panel error detail text as first-level signal.

### Provider degraded

- If only one provider shows degraded, inspect that provider endpoint and model inventory.
- If all providers degrade simultaneously, inspect gateway/network health first.
- Unlock private view and use event feed filters (`health`, `heartbeat`) for timeline context.

### Incident dashboard flow

1. Review stale badge and reconnect/error counters.
2. Inspect public health, cron, and provider panels first.
3. If deeper operator detail is needed, unlock private view and triage from newest private feed row downward.

```mermaid
flowchart TD
  Start[Incident detected] --> CheckState{Stale badge?}
  CheckState -->|Yes| Net[Check gateway connectivity + token]
  CheckState -->|No| Panel[Inspect cron/provider panels]
  Net --> Health[Check /api/private/health.json]
  Health --> Retry[Retry connection]
  Panel --> Feed[Unlock private view if deeper event detail is needed]
  Retry --> Verify[Verify recovery in dashboard]
  Feed --> Verify
  Verify --> Close[Close incident / document notes]
```

## Token Rotation

1. Rotate gateway token in OpenClaw.
2. Update `OPENCLAW_GATEWAY_TOKEN` in the SSR server environment.
3. Restart the SSR server (`npm run start`).
4. Confirm dashboard reconnects and connection status returns to connected.

## Health Verification

1. If private view is enabled, check health endpoint with your session cookie: `curl --cookie "clawsprawl_private_session=<session-id>" http://127.0.0.1:4321/api/private/health.json`
2. Verify `ok: true` and `connectionState: "connected"`.
3. Confirm stale badge shows `fresh ✅` in the dashboard UI.

## Monitoring

### Dashboard indicators

- **Stale badge:** Shows `stale ⚠️` when no successful snapshot received in 90 seconds.
- **Reconnect count:** Number of automatic reconnections since page load.
- **Error count:** Number of errors since page load.
- **Private preview grid:** Shows which panels stay locked without private auth.
- **Private activity feed:** Available only after unlocking private view.

### Health endpoint

The `/api/private/health.json` endpoint returns:
- `ok` — boolean, true when connected to gateway
- `connectionState` — current WebSocket state
- `serverVersion` — OpenClaw gateway version
- `reconnectCount` / `errorCount` — lifetime counters
- `availableMethods` / `availableEvents` — counts of discovered RPC methods and event types

### Metrics endpoint

The gateway exposes `/metrics` for Prometheus-compatible scraping. ClawSprawl surfaces
key operational metrics via its own API routes:

- `/api/private/health.json` — authenticated connection health, uptime, staleness, error/reconnect counters
- `/api/public/dashboard.json` — public snapshot for unauthenticated status surfaces
- `/api/private/dashboard.json` — authenticated full snapshot including private cards

For external monitoring, poll `/api/private/health.json` at 30–60 s intervals and alert on
`connectionState !== "connected"` or `stale === true`.
