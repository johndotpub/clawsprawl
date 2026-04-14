# Deployment and Operations

This page centralizes environment configuration, run commands, and deployment modes.

For incident playbooks, see [`operations-runbook.md`](operations-runbook.md).

## Local Development

```sh
npm install
npm run dev
```

Default local URL: `http://localhost:4321`

Create local config from template:

```sh
cp .env.example .env
```

## Environment Variables

- `OPENCLAW_GATEWAY_TOKEN` (required; server-side only)
- `OPENCLAW_GATEWAY_WS_URL` (optional; default `ws://localhost:18789/ws`)
- `OPENCLAW_GATEWAY_HTTP_URL` (optional; default gateway HTTP URL)
- `OPENCLAW_GATEWAY_SCOPES` (optional; default `operator.read`)
- `CLAWSPRAWL_MODE` (`public`, `token`, or `insecure`)
- `CLAWSPRAWL_PRIVATE_TOKEN` (required for `token` mode)
- `CLAWSPRAWL_SESSION_MAX_AGE_HOURS` (optional; default `24`, max `24`)
- `PUBLIC_MAINFRAME_PROFILE` (optional; profile id)

Template reference: [`../.env.example`](../.env.example)

## Deployment Modes

### Public dashboard only

```env
CLAWSPRAWL_MODE=public
```

- Public cards visible
- Private cards locked
- Private API routes return `401`

### Token-protected private dashboard

```env
CLAWSPRAWL_MODE=token
CLAWSPRAWL_PRIVATE_TOKEN=<your-private-bearer-token>
CLAWSPRAWL_SESSION_MAX_AGE_HOURS=24
```

- Public cards visible
- Private cards unlock after token bootstrap
- Private access uses secure `httpOnly` session cookie

### Insecure private-network mode

```env
CLAWSPRAWL_MODE=insecure
```

- Public and private cards visible immediately
- No private token required
- Never expose this mode to the public internet

## Build and Run

```sh
npm run build
npm run start
```

## Container Usage

Pull image:

```sh
docker pull ghcr.io/johndotpub/clawsprawl:v0.42.0
```

Token mode example:

```sh
docker run --rm -p 4321:4321 \
  -e OPENCLAW_GATEWAY_TOKEN=your_gateway_token \
  -e OPENCLAW_GATEWAY_WS_URL=ws://127.0.0.1:18789/ws \
  -e OPENCLAW_GATEWAY_HTTP_URL=http://127.0.0.1:18789 \
  -e CLAWSPRAWL_MODE=token \
  -e CLAWSPRAWL_PRIVATE_TOKEN=your_private_bearer_token \
  -e CLAWSPRAWL_SESSION_MAX_AGE_HOURS=24 \
  ghcr.io/johndotpub/clawsprawl:v0.42.0
```

Public mode example:

```sh
docker run --rm -p 4321:4321 \
  -e OPENCLAW_GATEWAY_TOKEN=your_gateway_token \
  -e CLAWSPRAWL_MODE=public \
  ghcr.io/johndotpub/clawsprawl:v0.42.0
```

## Ops Controller Script

```sh
npm run ops -- help
```

Common commands:

- `npm run ops -- status`
- `npm run ops -- init-local-profile`
- `npm run ops -- set-profile --profile private-local`
- `npm run ops -- tmux-up --profile private-local`
- `npm run ops -- tmux-up --local --auto-init-local`
- `npm run ops -- tmux-up --profile-file /path/to/private-profile.ts`
- `npm run ops -- dev --profile-file /path/to/private-profile.ts`
- `npm run ops -- qa-strict`

## Quality Gates

Primary gate:

```sh
npm run qa:strict
```

Additional checks:

```sh
npm run test
npm run build
npm run test:e2e
npm run test:docs:coverage
```

## Release Automation

- npm package publish workflow: [`../.github/workflows/publish-gpr.yml`](../.github/workflows/publish-gpr.yml)
- GHCR publish workflow: [`../.github/workflows/publish-container.yml`](../.github/workflows/publish-container.yml)
