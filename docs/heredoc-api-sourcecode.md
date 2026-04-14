# Heredoc API and Sourcecode Documentation

This project uses Heredoc-style command blocks as a first-class documentation pattern for:

- Multi-line API payload examples
- Generated commit and PR body templates
- Operator runbook snippets that must preserve exact formatting

Use single-quoted EOF delimiters when examples contain variable-like tokens that must not expand.

## Why Heredoc

- Prevents formatting drift in docs and automation snippets
- Keeps complex JSON/text payloads readable
- Matches conventions used in OpenClaw and adjacent tooling

## Core Gateway API Snapshot

The dashboard currently consumes these methods:

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

Methods available upstream and under consideration for future ClawSprawl use:

- `sessions.usage`
- `sessions.usage.timeseries`
- `sessions.usage.logs`
- `commands.list`
- `tools.effective`
- `tts.status`
- `tts.providers`
- `last-heartbeat`

And listens for event stream messages such as:

- `tick`
- `cron`
- `session.message`
- `health`
- `presence`

ClawSprawl does **not** expose the raw gateway event feed publicly. Public browsers receive only invalidation events from `/api/public/events`; raw gateway events remain private-only.

## Canonical Heredoc Patterns

### 1) Native protocol request frame

```sh
cat <<'EOF' > /tmp/gateway-status.json
{
  "type": "req",
  "id": "manual-1",
  "method": "status"
}
EOF
```

### 2) Native protocol connect handshake

```sh
cat <<'EOF' > /tmp/gateway-connect.json
{
  "type": "req",
  "id": "connect-1",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-control-ui",
      "version": "0.42.0",
      "platform": "linux",
      "mode": "webchat"
    },
    "auth": {
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    },
    "role": "operator",
    "scopes": ["operator.read"]
  }
}
EOF
```

### 3) Multi-line PR body template

```sh
gh pr create --title "phase update" --body "$(cat <<'EOF'
## Summary
- Add feature X
- Harden behavior Y

## Validation
- npm run test
- npm run build
EOF
)"
```

### 4) Runbook incident note

```sh
cat <<'EOF' > /tmp/incident-note.md
# Incident

## Symptom
Dashboard shows gateway connection error.

## Actions
1. Verify SSR server process
2. Verify OPENCLAW_GATEWAY_TOKEN is present
3. Use Retry Connection button
EOF
```

### 5) Private session bootstrap request

```sh
curl -i \
  -X POST http://127.0.0.1:4321/api/private/session \
  -H 'Authorization: Bearer YOUR_PRIVATE_TOKEN'
```

### 6) Public-vs-private route examples

```sh
cat <<'EOF' > /tmp/clawsprawl-routes.txt
GET /api/public/dashboard.json
GET /api/public/events
POST /api/private/session
GET /api/private/dashboard.json
GET /api/private/events
GET /api/private/health.json
EOF
```

## Sourcecode Anchors

Primary source paths tied to API behavior:

- `src/lib/auth/access.ts`
- `src/lib/gateway/client.ts`
- `src/lib/gateway/protocol.ts`
- `src/lib/dashboard/store.ts`
- `src/lib/dashboard/bootstrap.ts`
- `src/lib/dashboard/adapters.ts`
- `src/lib/dashboard/renderers.ts`
- `src/lib/dashboard/public-private.ts`

If adding a new API method to the dashboard, update all of:

1. gateway types (`src/lib/gateway/types.ts`)
2. adapters/normalizers (`src/lib/dashboard/adapters.ts`)
3. public/private shaping (`src/lib/dashboard/public-private.ts`)
4. renderers (`src/lib/dashboard/renderers.ts`)
5. render/bootstrap wiring (`src/lib/dashboard/bootstrap.ts`)
6. tests (`src/lib/**.test.ts`, `tests/site-phases.test.ts`)
7. this document (add the method to the consumed list above)

## Documentation Standard

When adding new docs in this repo:

- Prefer executable snippets
- Use Heredoc for multi-line payloads
- Keep source path references explicit
- Include validation commands (`npm run test`, `npm run build`)
