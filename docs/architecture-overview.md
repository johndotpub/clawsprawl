# Architecture Overview

This page captures the visual system model and high-level runtime boundaries.

For deeper implementation and roadmap detail, see [`technical-design-plan.md`](technical-design-plan.md).

## System Flow

```mermaid
flowchart LR
  Browser[Browser UI\nAstro SSR + dashboard runtime] -->|fetch + SSE| Server[ClawSprawl SSR Server\nAstro + Node adapter]
  Server -->|WebSocket RPC v3| Gateway[OpenClaw Gateway\nws://localhost:18789/ws]
  Server -->|SSE event stream| Gateway2[OpenClaw Gateway\nhttp://localhost:18789/event]
  Gateway --> Models[Model Providers\ncloud + local]
  Gateway --> Cron[Cron + automation jobs]
```

ClawSprawl maintains **one primary connection** to the OpenClaw gateway:
1. **WebSocket (RPC + event channel)**: Used for request/response calls (`status`, `agents.list`, `config.get`, etc.) and all broadcast event pushes (`tick`, `health`, `presence`, `agent`, `session.message`, `shutdown`, `update.available`, etc.). Managed by `GatewayClient`.

The gateway event bus is delivered exclusively over WebSocket broadcast events. Prior versions maintained a dual-stream (WS + SSE) architecture via a `GET /event` HTTP endpoint; that endpoint never existed in the canonical gateway surface and the SSE client was retired in v0.43.0.

## Request and Session Flow

```mermaid
sequenceDiagram
  participant U as Operator
  participant B as Browser
  participant S as ClawSprawl SSR Server
  participant G as OpenClaw Gateway
  U->>B: Open dashboard
  B->>S: GET /api/public/dashboard.json
  S->>G: WebSocket RPC (status, agents, sessions, ...)
  G-->>S: Response payloads (cached)
  S-->>B: Redacted public snapshot
  B->>S: EventSource /api/public/events
  G-->>S: Real-time events (tick, cron, session, ...)
  S-->>B: Snapshot invalidation events
  U->>B: Enter bearer token
  B->>S: POST /api/private/session
  S-->>B: httpOnly session cookie
  B->>S: GET /api/private/dashboard.json + EventSource /api/private/events
  B-->>U: Public + private live panels
```

## Runtime Boundaries

- Browser never connects directly to the gateway.
- `OPENCLAW_GATEWAY_TOKEN` stays server-side and is never sent to browser clients.
- Public routes provide redacted data; private routes require `token` mode session unlock or `insecure` private-network deployment mode.

## Challenge Nonce Verification

The gateway sends a `connect.challenge` event with a `{ nonce, ts }` payload immediately after WebSocket upgrade. clawsprawl connects device-less (no `device` block, shared-token loopback trust path) and enforces **loopback-only operation**: non-loopback `wss://` gateway URLs are rejected at handshake time with a clear error. Remote gateway support requires implementing device identity + v3 nonce signing (see roadmap).

## Module Anchors

- Gateway service: [`../src/lib/gateway/server-service.ts`](../src/lib/gateway/server-service.ts)
- Access/session model: [`../src/lib/auth/access.ts`](../src/lib/auth/access.ts)
- Dashboard bootstrap: [`../src/lib/dashboard/bootstrap.ts`](../src/lib/dashboard/bootstrap.ts)
- Public APIs: [`../src/pages/api/public/`](../src/pages/api/public)
- Private APIs: [`../src/pages/api/private/`](../src/pages/api/private)
