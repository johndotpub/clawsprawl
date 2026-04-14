# Contributing Guide 🤝

Thanks for helping build ClawSprawl! 🚀

## Quick Start

```sh
npm install
npm run test
npm run build
```

Optional browser smoke tests:

```sh
npm run test:e2e
```

## Branch and PR Expectations

- Keep changes focused and small when possible.
- Update docs when behavior changes.
- Add or update tests for code changes.
- Use clear commit messages aligned with existing history.

## Agentic Project Conventions

- Prefer modular runtime logic in `src/lib/**` and keep Astro components mostly structural.
- Keep security posture strict: no secrets in repo, server-side-only gateway token.
- Preserve dark-mode-only visual policy and terminal style.

## Architecture Notes

ClawSprawl uses an SSR architecture where the Astro server holds the gateway token and proxies data to the browser via API routes:

- `server-service.ts` — server-side gateway connection singleton
- `/api/public/dashboard.json` — public redacted snapshot endpoint
- `/api/public/events` — public SSE invalidation stream
- `/api/private/session` — private-view session create/delete endpoint
- `/api/private/dashboard.json` — authenticated private snapshot endpoint
- `/api/private/events` — authenticated SSE real-time event stream
- `/api/private/health.json` — authenticated health check endpoint
- `bootstrap.ts` — browser-side fetch + EventSource consumer

The browser never connects to the OpenClaw gateway directly.

## Code Quality Checklist ✅

- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] `npm run qa:strict` passes (coverage gates enforced)
- [ ] `npm run test:e2e` passes for UI/runtime changes
- [ ] `docs/technical-design-plan.md` updated for new phases or architecture changes
- [ ] `CHANGELOG.md` updated for release-worthy changes

## Linting & Formatting

This project uses TypeScript strict mode and Astro's built-in checks. Before submitting:

```sh
npm run qa:strict   # runs unit tests with coverage gates + build
```

## Developer Certificate of Origin (DCO)

By submitting a pull request, you certify that you have the right to submit the work under the project's license (Unlicense). No formal CLA is required — your PR implies agreement with the DCO.

## Security Notes 🔒

- Never commit live tokens, keys, or private host details.
- Gateway token is server-side only (`OPENCLAW_GATEWAY_TOKEN`).
- Private dashboard unlock uses a separate server-side token (`CLAWSPRAWL_PRIVATE_TOKEN`) in `CLAWSPRAWL_MODE=token`.
- Runbook updates belong in `docs/operations-runbook.md`.
