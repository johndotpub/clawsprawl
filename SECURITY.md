# Security Policy 🔐

## Supported Versions

Security fixes are applied to:

- `main` (active development)
- Latest public release line (`0.42.x` until superseded)

## Reporting a Vulnerability

Please do not open public issues for sensitive vulnerabilities.

Instead:

1. **Preferred:** Use [GitHub Security Advisories](https://github.com/johndotpub/clawsprawl/security/advisories/new) to file a private report.
2. Include reproduction steps, impact, and suggested mitigation if available.
3. Mark whether secrets/tokens may have been exposed.
4. Maintainers aim to acknowledge reports within 72 hours.

## Scope Highlights

- SSR server-side gateway auth flow and token handling
- Dashboard runtime rendering and event ingestion
- Gateway SSE + WebSocket integration paths
- CI/release workflow integrity

## Secret Handling

- Never commit live secrets.
- Use `OPENCLAW_GATEWAY_TOKEN` for gateway auth.
- Request least-privilege gateway scopes by default (`operator.read`).
- Use `OPENCLAW_GATEWAY_SCOPES` only when broader scopes are explicitly required.
- Use `CLAWSPRAWL_PRIVATE_TOKEN` only for browser private-view bootstrap in `CLAWSPRAWL_MODE=token`.
- Keep browser-facing environment variables non-sensitive.

## Access Modes

- `CLAWSPRAWL_MODE=public`
  - public dashboard only
  - private routes stay unavailable
- `CLAWSPRAWL_MODE=token`
  - public dashboard plus token-protected private view
  - browser submits bearer token once to `/api/private/session`
  - server returns a secure `httpOnly` session cookie backed by server-side session state
  - cookie is browser-session scoped; server-side expiry is capped by `CLAWSPRAWL_SESSION_MAX_AGE_HOURS` and must never exceed 24 hours
- `CLAWSPRAWL_MODE=insecure`
  - all public/private dashboard surfaces visible without auth
  - private-network-only, unsafe on public internet

## Browser and Route Security

- The browser never receives `OPENCLAW_GATEWAY_TOKEN`.
- Public routes are summary-only and must not expose private operator data.
- Public SSE must never forward raw `gateway-event` payloads.
- Private routes require a valid server-side private session unless insecure mode is explicitly enabled.
- Locking private view must invalidate the server-side session immediately.

## Hardening Baseline

- SSR server-side auth mode
- Localhost-first defaults
- OpenTelemetry disabled by default
- Test/build/e2e checks in CI
