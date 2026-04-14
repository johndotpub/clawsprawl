# Extension Documentation

This file defines extension points for the ClawSprawl dashboard so features can be added without reworking core modules.

Private/public visibility is part of the extension contract. New data surfaces must be classified as either public-safe summary data or private authenticated data before adding routes, panels, or tests.

## Extension Surfaces

### 1) Gateway data extension

Use this path when introducing a new gateway method/event:

1. Add shape to `src/lib/gateway/types.ts`
2. Normalize payload in `src/lib/dashboard/adapters.ts`
3. Store state in `src/lib/dashboard/store.ts`
4. Decide whether the data belongs in `src/lib/dashboard/public-private.ts` public summaries, private snapshot only, or both
5. Render via `src/lib/dashboard/renderers.ts`
6. Wire server fetch/refresh in `src/lib/gateway/server-service.ts`
7. Wire browser snapshot/SSE handling in `src/lib/dashboard/bootstrap.ts`
8. Add leak-prevention tests for public routes if any part of the payload is public

### 2) New dashboard panel extension

Add a panel section in `src/components/dashboard/GatewayBootstrap.astro`, then implement renderer helpers instead of embedding long in-template logic.

Guideline:
- Keep Astro component focused on structure/IDs
- Keep business logic in `src/lib/dashboard/*`
- Keep panel visibility in `src/lib/dashboard/panel-config.ts`
- Keep public/private payload shaping in `src/lib/dashboard/public-private.ts`

### 3) Visual language extension

Add visual primitives in `src/styles/global.css`.

Rules:
- Dark mode only
- Keep palette aligned to existing terminal tokens
- Respect `prefers-reduced-motion`

### 4) Docs extension

When adding a new capability:

- Update `docs/technical-design-plan.md`
- Update `README.md` if operator behavior changed
- Update `docs/operations-runbook.md` for incident handling
- Add Heredoc examples in `docs/heredoc-api-sourcecode.md` when payload snippets are multi-line

### 5) Profile extension

Landing identity and topology are profile-driven:

- `src/config/profiles/public-demo.ts`
- `src/config/profiles/sprawl-lab.ts`
- `src/config/profiles/*.local.ts` (private local overrides)
- `src/config/profiles/index.ts`

To add a new profile:

1. Create a new profile module in `src/config/profiles/`.
2. Register it in `src/config/profiles/index.ts`.
3. Set `PUBLIC_MAINFRAME_PROFILE=<new-id>` for testing.
4. Add/adjust harness tests for profile coverage.

For private/local profiles, use `*.local.ts` naming (gitignored) and export `localProfile`.

## Example: Add `cron.status` detail card

### Step A - Type

```ts
// src/lib/gateway/types.ts
export interface CronStatusSummary {
  enabled?: boolean;
  timezone?: string;
}
```

### Step B - Adapter

```ts
// src/lib/dashboard/adapters.ts
export function normalizeCronStatus(payload: unknown): CronStatusSummary {
  const record = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {};
  return {
    enabled: Boolean(record.enabled),
    timezone: typeof record.timezone === 'string' ? record.timezone : undefined,
  };
}
```

### Step C - Store + Bootstrap

- Add `cronStatus` to `DashboardState`
- Fetch in server service: `client.call('cron.status')`
- Store and render through renderer helper

### Step D - Tests

- Unit test for adapter
- Unit test for `public-private.ts` if any public-safe shaping is added
- Harness assertion in `tests/site-phases.test.ts`

## Extension Checklist

- [ ] Types updated
- [ ] Adapter/normalizer added
- [ ] Store shape updated
- [ ] Bootstrap wiring updated
- [ ] Public/private visibility and redaction policy updated
- [ ] Renderer output updated
- [ ] Docs updated
- [ ] Tests added/updated
- [ ] `npm run qa:strict` passes (coverage gates enforced)
