import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGatewayDashboard } from './bootstrap';
import { PRIVATE_DASHBOARD_PANELS, PUBLIC_DASHBOARD_PANELS } from './panel-config';

type Listener = (event?: { preventDefault?: () => void }) => void;

class MockElement {
  textContent = '';
  className = '';
  innerHTML = '';
  value = '';
  private attributes = new Map<string, string>();
  private listeners = new Map<string, Listener[]>();
  private checkboxNodes: Array<{ getAttribute: (name: string) => string | null }> = [];

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  dispatch(type: string, event: { preventDefault?: () => void } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  querySelectorAll(selector: string): Array<{ getAttribute: (name: string) => string | null }> {
    return selector === 'input[type="checkbox"]:checked' ? this.checkboxNodes : [];
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  setCheckedValues(values: string[]): void {
    this.checkboxNodes = values.map((value) => ({
      getAttribute: (name: string) => (name === 'value' ? value : null),
    }));
  }
}

function makeSnapshot(connectionState: string) {
  return {
    connectionState,
    agents: [{ id: 'ceo' }],
    sessions: [{ key: 'agent:ceo:main', status: 'running' }],
    cronJobs: [],
    cronRuns: [],
    models: [],
    health: { ok: true, channels: {} },
    status: { ok: true, version: '2026.4.11' },
    presence: [],
    usageCost: null,
    toolsCatalog: null,
    skillsStatus: null,
    channelsStatus: null,
    cronScheduler: null,
    memoryStatus: null,
    configData: null,
    fileStatus: null,
    sessionDetails: null,
    availableMethods: ['status', 'agents.list'],
  };
}

describe('initGatewayDashboard', () => {
  let elements = new Map<string, MockElement>();
  let eventSources: Array<{ emit: (type: string, data?: unknown) => void }> = [];

  async function flushAsyncWork(cycles = 12): Promise<void> {
    for (let i = 0; i < cycles; i += 1) {
      await Promise.resolve();
    }
  }

  async function waitFor(condition: () => boolean, cycles = 60): Promise<void> {
    for (let i = 0; i < cycles; i += 1) {
      if (condition()) return;
      await flushAsyncWork(1);
    }

    throw new Error('Condition was not met before timeout');
  }

  function installGlobals(withPrivate = false, privateConfigured = true): void {
    const baseIds = [
      'gateway-dashboard-root',
      'gateway-connection-state',
      'gateway-agents',
      'gateway-sessions',
      'gateway-updated',
      'gateway-message',
      'gateway-agent-list',
      'gateway-retry',
      'gateway-retry-note',
      'gateway-stale-badge',
      'gateway-reconnect-count',
      'gateway-error-count',
      'hero-agent-count',
      'hero-status-dot',
      'hero-status-text',
      'private-view-form',
      'private-view-token',
      ...PUBLIC_DASHBOARD_PANELS.map((panel) => panel.id),
    ];

    const privateIds = withPrivate
      ? ['private-view-lock', 'gateway-event-list', 'gateway-event-filters', ...PRIVATE_DASHBOARD_PANELS.map((panel) => panel.id)]
      : [];

    elements = new Map<string, MockElement>();
    for (const id of [...baseIds, ...privateIds]) elements.set(id, new MockElement());
    elements.get('gateway-event-filters')?.setCheckedValues(['tool', 'session']);
    elements.get('private-view-token')!.value = 'private-token';
    elements.get('gateway-dashboard-root')?.setAttribute('data-private-view-enabled', withPrivate ? 'true' : 'false');
    elements.get('gateway-dashboard-root')?.setAttribute('data-private-configured', privateConfigured ? 'true' : 'false');
    elements.get('gateway-dashboard-root')?.setAttribute('data-access-mode', withPrivate ? 'token' : 'token');

    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        const id = selector.startsWith('#') ? selector.slice(1) : selector;
        return elements.get(id) ?? null;
      },
    });

    class MockEventSource {
      listeners = new Map<string, Array<(event: { data: string }) => void>>();
      onerror: (() => void) | null = null;

      constructor() {
        eventSources.push(this);
      }

      addEventListener(type: string, listener: (event: { data: string }) => void): void {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
      }

      emit(type: string, data?: unknown): void {
        const payload = data === undefined ? '' : JSON.stringify(data);
        for (const listener of this.listeners.get(type) ?? []) listener({ data: payload });
      }

      close(): void {}
    }

    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    vi.stubGlobal('window', {
      addEventListener: () => undefined,
      location: { reload: vi.fn() },
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    eventSources = [];
    vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: TimerHandler) => {
      if (typeof cb === 'function') cb();
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates the public dashboard and unlocks private view through the token form', async () => {
    installGlobals(false);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/private/session')) {
        expect((init as RequestInit | undefined)?.headers).toMatchObject({ Authorization: 'Bearer private-token' });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 });
    });

    initGatewayDashboard();
    await flushAsyncWork();

    expect(elements.get('gateway-connection-state')?.textContent).toBe('connected');
    expect(elements.get('gateway-message')?.textContent).toContain('public panels');

    elements.get('private-view-form')?.dispatch('submit', { preventDefault: () => undefined });
    await flushAsyncWork();
    expect(fetchSpy).toHaveBeenCalledWith('/api/private/session', expect.objectContaining({ method: 'POST' }));
    expect((window.location.reload as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(eventSources).toHaveLength(1);
  });

  it('hydrates public and private views together when unlocked', async () => {
    installGlobals(true);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/public/dashboard.json')) {
        return new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 });
      }
      if (url.includes('/api/private/dashboard.json')) {
        return new Response(JSON.stringify({
          ...makeSnapshot('connected'),
          configData: { logLevel: 'debug' },
          fileStatus: [{ path: 'src/index.ts', status: 'modified' }],
        }), { status: 200 });
      }
      if (url.includes('/api/private/session')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    initGatewayDashboard();
    await flushAsyncWork();

    await waitFor(() => (elements.get('gateway-message')?.textContent ?? '').includes('private view unlocked'));

    expect(elements.get('gateway-message')?.textContent).toContain('private view unlocked');
    expect(eventSources).toHaveLength(2);

    eventSources[1]?.emit('gateway-event', { event: 'session.tool', payload: { tool: 'bash' }, seq: 1 });
    eventSources[1]?.emit('snapshot-updated');

    elements.get('private-view-lock')?.dispatch('click');
    await flushAsyncWork();
    expect((window.location.reload as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('shows validation feedback when private token input is missing', async () => {
    installGlobals(false, true);
    elements.get('private-view-token')!.value = '   ';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 }),
    );

    initGatewayDashboard();
    await flushAsyncWork();

    elements.get('private-view-form')?.dispatch('submit', { preventDefault: () => undefined });
    await flushAsyncWork();

    expect(fetchSpy).not.toHaveBeenCalledWith('/api/private/session', expect.anything());
    expect(elements.get('gateway-message')?.textContent).toContain('Enter a valid bearer token');
  });

  it('shows unlock error when private session endpoint rejects token', async () => {
    installGlobals(false, true);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/private/session')) {
        return new Response(JSON.stringify({ ok: false, error: 'invalid-token' }), { status: 401 });
      }
      return new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 });
    });

    initGatewayDashboard();
    await flushAsyncWork();

    elements.get('private-view-form')?.dispatch('submit', { preventDefault: () => undefined });
    await flushAsyncWork();

    expect(elements.get('gateway-message')?.textContent).toContain('unlock failed');
    expect((window.location.reload as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('does not submit unlock flow when private mode is not configured', async () => {
    installGlobals(false, false);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 })
    ));

    initGatewayDashboard();
    await flushAsyncWork();

    elements.get('private-view-form')?.dispatch('submit', { preventDefault: () => undefined });
    await flushAsyncWork();

    expect(fetchSpy).not.toHaveBeenCalledWith('/api/private/session', expect.anything());
    expect(elements.get('gateway-message')?.textContent).toContain('Enter a valid bearer token');
  });

  it('reloads when private snapshot auth expires and handles SSE error hooks', async () => {
    installGlobals(true, true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/public/dashboard.json')) {
        return new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 });
      }
      if (url.includes('/api/private/dashboard.json')) {
        return new Response(JSON.stringify({ ok: false, error: 'private-auth-required' }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    initGatewayDashboard();
    await flushAsyncWork();

    expect((window.location.reload as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    eventSources[0]?.onerror?.();
    eventSources[1]?.onerror?.();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('retries bootstrap when retry button is pressed', async () => {
    installGlobals(false, true);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 })
    ));

    initGatewayDashboard();
    await flushAsyncWork();
    const initialCalls = fetchSpy.mock.calls.length;

    elements.get('gateway-retry')?.dispatch('click');
    await flushAsyncWork();

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('marks connection error on failed public snapshot and refreshes on public SSE snapshot updates', async () => {
    installGlobals(false, true);

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 503 }))
      .mockImplementation(async () => new Response(JSON.stringify(makeSnapshot('connected')), { status: 200 }));

    initGatewayDashboard();
    await flushAsyncWork();

    expect(elements.get('gateway-connection-state')?.textContent).toBe('error');

    const callsBeforeSse = fetchSpy.mock.calls.length;
    eventSources[0]?.emit('snapshot-updated');
    await flushAsyncWork();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBeforeSse);
  });
});
