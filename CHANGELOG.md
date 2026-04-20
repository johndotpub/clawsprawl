# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [0.42.69] - 2026-04-19

### Security

- **C1**: Replace timing-unsafe `===` token comparison with `crypto.timingSafeEqual` in `access.ts` to prevent timing side-channel attacks on bearer token validation.
- **C2**: Close shell injection vector in `cs-ops.sh` by using `tmux set-environment` instead of string interpolation for gateway token and profile environment variables.
- **H1**: Add per-IP rate limiting with lockout on `POST /api/private/session` to prevent brute-force token guessing.
- **H2**: Validate token type at runtime in session POST — non-string values (e.g., `{ "token": 12345 }`) now return 401 instead of causing a 500 TypeError.
- **H7**: Add Content-Security-Policy via Astro middleware, blocking inline scripts and restricting resource origins. Set CSP on all routes (including API routes) via response headers.
- **M5**: Add centralized auth middleware (`src/middleware.ts`) that enforces auth on all `/api/private/*` routes, preventing forgotten guards on new private routes.
- **M14**: Add field allowlist to `normalizeConfigData` — gateway config secrets are no longer blindly rendered in the private dashboard panel.
- **M15**: Replace `...entry` spread in normalizers with explicit field picks — unknown gateway fields (including potential secrets) no longer propagate to client.
- **M19**: Filter `usageCost`/`usageStatus` from public snapshot — per-provider cost and rate-limit data no longer visible to unauthenticated viewers.
- **M20**: Filter `memoryStatus` from public snapshot — embedding provider and agent ID infrastructure details no longer visible to unauthenticated viewers.
- **M21**: Filter `cronJobs`/`cronRuns` from public snapshot — internal operation names and schedules no longer visible to unauthenticated viewers.
- **M22**: Remove `mode: 'insecure'` from POST session response — no longer leaks access-mode configuration to aid reconnaissance.
- **M25**: Add auth guard to `DELETE /api/private/session` — unauthenticated users can no longer delete active sessions.
- **M27**: Add `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` response headers via middleware.
- **M29**: Add `--ignore-scripts` to `npm ci` in Dockerfile build stage — prevents malicious `postinstall` scripts from executing during build.
- **M28**: Switch Docker base image to Chainguard (`cgr.dev/chainguard/node:latest`) — removes shell, apt, and dpkg from container, significantly reducing attack surface.
- **L2**: Add default same-origin CORS policy with `CORS_ALLOW_ORIGIN` env var override — cross-origin access is denied by default and must be explicitly enabled.
- **L18**: Guard `clearPrivateSessionsForTest` with `NODE_ENV` check — prevents accidental production session wipe.
- **L19**: Tighten `access.ts` export surface — only symbols needed by external consumers are exported.
- **L50**: Add `Content-Type: application/json` validation before `request.json()` in session POST.
- **L52**: Add `.env` insecure-mode commit warning to `.env.example`.
- **L55**: Add Node.js permission model flags (`--allow-fs`, `--allow-net`) to Dockerfile and start script — restricts runtime to only necessary filesystem and network access.
- **L57**: Document challenge nonce verification path and add `verifyGatewayNonce` stub for future mutual authentication.
- Send private view token only via `Authorization` header, removing redundant JSON body transmission.
- Add token strength guidance and missing env vars (`OPENCLAW_GATEWAY_HTTP_URL`, `OPENCLAW_GATEWAY_SCOPES`) to `.env.example`.
- Add RFC 8594 `Deprecation`/`Sunset`/`Link` headers on deprecated API routes.
- Add `X-Request-ID` response header for request correlation across gateway flows.
- Use placeholder token in `docs:screenshots` script instead of hardcoded value.

### Fixed

- **H3**: Cap in-memory session store at 10,000 entries with periodic pruning every 5 minutes — prevents memory exhaustion DoS.
- **H4**: Deduplicate concurrent `connect()` calls in `GatewayClient` via `connectInFlight` promise — prevents orphaned WebSocket creation.
- **H5**: Store and clear reconnect timer handle on `disconnect()` — prevents zombie reconnections after explicit disconnect.
- **H6**: Add `destroy()` method to `GatewayServerService` that cleans up intervals, timeouts, connections, and listeners — enables graceful server shutdown.
- **H8/M12**: Cache panel HTML and skip unchanged `innerHTML` writes; log store listener errors — eliminates redundant DOM rebuilds.
- **M1**: Add `maxAge` to session cookie aligned with server-side 24-hour TTL.
- **M2**: Log warning at startup and hourly when `insecure` mode is active.
- **M3**: Periodically re-validate session in SSE stream — revoked sessions no longer continue receiving private data.
- **M4**: Return `expiresInSeconds` instead of absolute `expiresAt` timestamp in session response.
- **M6**: Add max reconnect attempts (default 20) to both WebSocket and SSE clients — prevents infinite reconnection to dead gateway.
- **M7**: Add dedicated `rpcTimeoutMs` option (default 30s) separate from `connectTimeoutMs` — long-running RPCs no longer time out prematurely.
- **M8**: Add runtime payload shape validation to `isConnectChallenge` using `Record<string, unknown>` narrowing instead of `as any`.
- **M9**: Fix SSE multi-line `data:` concatenation to include `\n` separator per spec.
- **M10**: Handle `\r\n` line endings in SSE stream parsing.
- **M11**: Set `stale: true` on gateway disconnect and add time-based staleness check.
- **M13**: Add per-panel error boundary in `renderState` — one broken panel no longer prevents rendering of subsequent panels.
- **M23**: Add `.catch()` to voided `readStream` promise — prevents unhandled rejection crash.
- **M24**: Single-source `CLIENT_VERSION` from `package.json` via Vite `define` — fixes version mismatch between `protocol.ts` and `package.json`.
- **L1**: Build public snapshot explicitly instead of using spread — prevents future `sessionsByAgent` data leak if `buildPublicSnapshot` is changed.
- **L16**: Use `Math.round` instead of `Math.floor` for fractional session max age hours — `0.5` hours is now valid (30 minutes) instead of silently becoming `0` (24h default).
- **L17**: Add strict format validation to `readBearerToken` — empty `Bearer ` no longer returns empty string.
- **L20**: Explicitly remove WebSocket event listeners on disconnect instead of relying on GC.
- **L22**: Log store listener errors to `console.error` instead of swallowing silently.
- **L23**: Validate `fetchSnapshot` JSON response shape before type assertion.
- **L25**: Remove illegal `Connection: keep-alive` header from SSE routes (incompatible with HTTP/2).
- **L26**: Add `NODE_ENV=production` to `start` script.
- **L30**: Reset `reconnectCount` after successful connection.
- **L31**: Use `structuredClone()` for deep snapshot copy in `getSnapshot()` — prevents nested object mutation corrupting cache.
- **L32**: Add `Array.isArray` check in `parseMessage` — arrays no longer pass as valid frames.
- **L34**: Use explicit `event`/`payload` field extraction in `emitParsedEvent` instead of loose heuristics.
- **L40**: Replace O(n) ring buffer spread with proper ring buffer in `pushEvent` — avoids creating a new array on every push.
- **L41**: Add runtime validation to `HelloOk` type assertion — prevents downstream crash on unexpected shape.
- **L43**: Unsubscribe store listeners and remove DOM event listeners in `beforeunload` cleanup.
- **L47**: Catch `ws.send()` errors and reject pending RPC instead of orphaning the promise until timeout.
- **L48**: Add periodic primary URL retry after falling back to fallback URL — recovers automatically when primary gateway recovers.

### Changed

- **M16**: Dockerfile runner stage now uses `COPY --chown=node:node` and includes a `HEALTHCHECK` instruction.
- **M18**: `.env` file parsed line-by-line for `KEY=VALUE` pairs instead of sourced — prevents arbitrary shell command execution.
- **M26**: Architecture documentation updated to show dual-stream (WebSocket RPC + SSE event bus) design.
- **L21**: Remove unused `connecting → connected` state transition from state machine.
- **L37**: Hoist `panelRenderers` as module-level constant — no longer rebuilt on every `renderState` call.
- **L39**: Move `requestCounter` from module-level mutable state to per-`GatewayClient` instance — safe for multi-instance usage.

### Added

- **L33**: Add `id:` field and `Last-Event-ID` support to SSE client for resumable reconnection.
- **L38**: Add `maxDailyEntries` cap to `usageCost.daily` array in store.
- **L24**: Add structured `console.error` calls in bootstrap catch paths and store listener.

### Accessibility

- Add `aria-label` to private view token input.
- Add `role="status"` to status badge markup.
- Add `aria-hidden="true"` to connection state dot (adjacent text already provides status).

### Chore

- Add `docs/screenshots/` to `.gitignore`.
- Add `.swp`/`.swo` editor temp files to `.gitignore`.
- Reduce Docker build context by excluding `scripts/`, `tests/`, `docs/`, `.github/` in `.dockerignore`.
- Pin Dockerfile base image to exact minor version.
- Narrow `COPY . .` in Docker build stage to only required directories.
- Add ESLint security rules (`eslint-plugin-no-unsanitized`, `@typescript-eslint/no-explicit-any`).
- Apply `no-constant-condition` ESLint rule to TypeScript files.
- Add comment explaining `renderers.ts` coverage exclusion in `vitest.config.ts`.
- Add full e2e suite to `qa:strict` script chain.
- Add production smoke test (`astro preview`) to CI.
- Gate security scan results in CI pipeline.
- Add Shellcheck step to CI pipeline.
- Add Docker ecosystem to Dependabot config.
- Add SLSA provenance and SBOM to container publish workflow.
- Bump version to `0.42.69`.

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
