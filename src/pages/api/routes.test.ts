import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPrivateSessionsForTest, PRIVATE_SESSION_COOKIE } from '../../lib/auth/access';
import { initializeService } from '../../lib/gateway/server-service';
import { GET as getDeprecatedDashboard } from './dashboard.json';
import { GET as getDeprecatedEvents } from './events';
import { GET as getDeprecatedHealth } from './health.json';
import { GET as getPublicDashboard } from './public/dashboard.json';
import { GET as getPublicEvents } from './public/events';
import { GET as getPrivateDashboard } from './private/dashboard.json';
import { GET as getPrivateEvents } from './private/events';
import { GET as getPrivateHealth } from './private/health.json';
import { DELETE as deletePrivateSession, POST as postPrivateSession } from './private/session';

vi.mock('../../lib/gateway/server-service', () => {
  const unsubscribeEvent = vi.fn();
  const unsubscribeSnapshot = vi.fn();

  const snapshot = {
    connectionState: 'connected',
    lastUpdatedAt: '2026-04-12T00:00:00.000Z',
    lastSuccessfulSnapshotAt: '2026-04-12T00:00:00.000Z',
    stale: false,
    reconnectCount: 0,
    errorCount: 0,
    agents: [{ id: 'ceo', workspace: '/srv/openclaw/workspaces/ceo' }],
    sessions: [{ key: 'agent:ceo:main' }],
    cronJobs: [],
    cronRuns: [],
    models: [],
    health: {
      ok: true,
      ts: 123,
      channels: {
        slack: { running: true, probeOk: true, botUsername: 'secret-bot', lastError: 'private failure' },
      },
      channelOrder: ['slack'],
      channelLabels: { slack: 'Slack' },
    },
    status: null,
    presence: [{ host: 'ws-1', ts: 1 }],
    usageCost: null,
    usageStatus: {
      updatedAt: 1712345678000,
      providers: [{ provider: 'openai', status: 'ok', used: 100, limit: 1000, remaining: 900, resetAt: 1712400000000 }],
    },
    toolsCatalog: null,
    skillsStatus: {
      workspaceDir: '/srv/openclaw/skills',
      managedSkillsDir: '/srv/openclaw/skills-managed',
      skills: [{
        name: 'taskflow',
        description: 'task workflow helper',
        source: 'bundled',
        bundled: true,
        always: false,
        disabled: false,
        eligible: true,
        missing: { bins: ['bash'], env: ['OPENAI_API_KEY'] },
      }],
    },
    channelsStatus: {
      ts: 123,
      channelOrder: ['slack'],
      channelLabels: { slack: 'Slack' },
      channels: {
        slack: { configured: true, running: true, lastStartAt: 10, lastStopAt: null, lastError: 'private failure' },
      },
      channelAccounts: {
        slack: [{
          accountId: 'ops',
          enabled: true,
          configured: true,
          running: true,
          connected: true,
          lastStartAt: 10,
          lastStopAt: null,
          lastError: 'private failure',
          lastInboundAt: 11,
          lastOutboundAt: 12,
          reconnectAttempts: 2,
          bot: { id: 'bot-1', username: 'secret-bot' },
        }],
      },
    },
    cronScheduler: {
      enabled: true,
      jobs: 2,
      nextWakeAtMs: 123,
      storePath: '/srv/openclaw/cron/jobs.db',
    },
    memoryStatus: null,
    configData: { logLevel: 'debug' },
    fileStatus: [{ path: 'src/index.ts', status: 'modified' }],
    sessionDetails: [{ key: 'agent:ceo:main', status: 'running' }],
    sessionsByAgent: new Map([['ceo', 1]]),
    serverVersion: '2026.4.11',
    availableMethods: ['status', 'agents.list', 'config.get'],
    availableEvents: ['tick', 'session.tool'],
  };

  const onEvent = vi.fn((listener: (event: unknown) => void) => {
    listener({ event: 'session.tool', payload: { tool: 'bash' }, seq: 1 });
    return unsubscribeEvent;
  });

  const onSnapshotUpdated = vi.fn((listener: () => void) => {
    listener();
    return unsubscribeSnapshot;
  });

  const service = {
    getSnapshot: vi.fn(() => snapshot),
    onEvent,
    onSnapshotUpdated,
    connectionState: 'connected',
  };

  return {
    getServerService: vi.fn(() => service),
    initializeService: vi.fn(async () => service),
  };
});

function createCookies(initial = new Map<string, string>()) {
  const jar = new Map(initial);
  return {
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
    jar,
  };
}

describe('api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPrivateSessionsForTest();
    process.env.CLAWSPRAWL_MODE = 'token';
    process.env.CLAWSPRAWL_PRIVATE_TOKEN = 'private-token';
    delete process.env.CLAWSPRAWL_SESSION_MAX_AGE_HOURS;
  });

  it('returns 410 for deprecated mixed routes', async () => {
    expect((await getDeprecatedDashboard({} as any)).status).toBe(410);
    expect((await getDeprecatedEvents({} as any)).status).toBe(410);
    expect((await getDeprecatedHealth({} as any)).status).toBe(410);
  });

  it('serializes public dashboard snapshot without private fields', async () => {
    const response = await getPublicDashboard({} as any);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.connectionState).toBe('connected');
    expect(json.sessions).toEqual([]);
    expect(json.presence).toEqual([]);
    expect(json.configData).toBeNull();
    expect(json.fileStatus).toBeNull();
    expect(json.sessionDetails).toBeNull();
    expect(json.usageStatus.providers[0].provider).toBe('openai');
    expect(json.agents).toEqual([{ id: 'ceo' }]);
    expect(json.skillsStatus.workspaceDir).toBe('');
    expect(json.skillsStatus.managedSkillsDir).toBe('');
    expect(json.skillsStatus.skills[0].missing).toBeUndefined();
    expect(json.cronScheduler.storePath).toBeUndefined();
    expect(json.serverVersion).toBeNull();
    expect(json.availableMethods).toEqual([]);
    expect(json.health.channels.slack.botUsername).toBeUndefined();
    expect(json.health.channels.slack.lastError).toBeUndefined();
    expect(json.channelsStatus.channelAccounts.slack[0].bot).toBeUndefined();
    expect(json.channelsStatus.channelAccounts.slack[0].lastError).toBeNull();
    expect(json.channelsStatus.channelAccounts.slack[0].lastInboundAt).toBeNull();
    expect(JSON.stringify(json)).not.toContain('secret-bot');
    expect(JSON.stringify(json)).not.toContain('private failure');
    expect(JSON.stringify(json)).not.toContain('src/index.ts');
    expect(JSON.stringify(json)).not.toContain('ws-1');
    expect(JSON.stringify(json)).not.toContain('/srv/openclaw');
    expect(JSON.stringify(json)).not.toContain('OPENAI_API_KEY');
  });

  it('requires private auth for private snapshot and health', async () => {
    const cookies = createCookies();
    expect((await getPrivateDashboard({ cookies } as any)).status).toBe(401);
    expect((await getPrivateHealth({ cookies } as any)).status).toBe(401);
    expect((await getPrivateEvents({ cookies } as any)).status).toBe(401);
  });

  it('returns private snapshot and health when authenticated', async () => {
    const cookies = createCookies();
    await postPrivateSession({
      request: new Request('http://localhost/api/private/session', {
        method: 'POST',
        headers: { authorization: 'Bearer private-token' },
      }),
      cookies,
    } as any);

    const dashboard = await getPrivateDashboard({ cookies } as any);
    const health = await getPrivateHealth({ cookies } as any);
    expect(dashboard.status).toBe(200);
    expect(health.status).toBe(200);

    const dashboardJson = await dashboard.json();
    const healthJson = await health.json();
    expect(dashboardJson.configData).toEqual({ logLevel: 'debug' });
    expect(dashboardJson.fileStatus).toHaveLength(1);
    expect(dashboardJson.sessionsByAgent).toEqual({ ceo: 1 });
    expect(healthJson.ok).toBe(true);
  });

  it('returns 503 for private health when gateway is disconnected', async () => {
    vi.mocked(initializeService).mockResolvedValueOnce({
      getSnapshot: () => ({
        connectionState: 'error',
        lastUpdatedAt: null,
        lastSuccessfulSnapshotAt: null,
        stale: true,
        reconnectCount: 0,
        errorCount: 1,
        serverVersion: '2026.4.11',
        availableMethods: ['status'],
        availableEvents: ['tick'],
      }),
    } as any);

    const cookies = createCookies();
    await postPrivateSession({
      request: new Request('http://localhost/api/private/session', {
        method: 'POST',
        headers: { authorization: 'Bearer private-token' },
      }),
      cookies,
    } as any);

    const health = await getPrivateHealth({ cookies } as any);
    expect(health.status).toBe(503);
    expect((await health.json()).ok).toBe(false);
  });

  it('sets and clears the private session cookie', async () => {
    const cookies = createCookies();

    const unauthorized = await postPrivateSession({
      request: new Request('http://localhost/api/private/session', { method: 'POST', body: JSON.stringify({ token: 'bad' }) }),
      cookies,
    } as any);
    expect(unauthorized.status).toBe(401);

    const authorized = await postPrivateSession({
      request: new Request('http://localhost/api/private/session', {
        method: 'POST',
        headers: { authorization: 'Bearer private-token' },
      }),
      cookies,
    } as any);
    expect(authorized.status).toBe(200);
    expect(cookies.jar.get(PRIVATE_SESSION_COOKIE)).toBeTruthy();

    const logout = await deletePrivateSession({ cookies } as any);
    expect(logout.status).toBe(200);
    expect(cookies.jar.has(PRIVATE_SESSION_COOKIE)).toBe(false);
  });

  it('returns disabled response when private token mode is not configured', async () => {
    process.env.CLAWSPRAWL_MODE = 'public';
    delete process.env.CLAWSPRAWL_PRIVATE_TOKEN;

    const response = await postPrivateSession({
      request: new Request('http://localhost/api/private/session', {
        method: 'POST',
        headers: { authorization: 'Bearer anything' },
      }),
      cookies: createCookies(),
    } as any);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: 'private-view-disabled' });
  });

  it('returns insecure mode acknowledgment for private session bootstrap', async () => {
    process.env.CLAWSPRAWL_MODE = 'insecure';
    delete process.env.CLAWSPRAWL_PRIVATE_TOKEN;

    const response = await postPrivateSession({
      request: new Request('http://localhost/api/private/session', {
        method: 'POST',
        headers: { authorization: 'Bearer ignored' },
      }),
      cookies: createCookies(),
    } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, mode: 'insecure' });
  });

  it('allows private routes in insecure mode without a session', async () => {
    process.env.CLAWSPRAWL_MODE = 'insecure';
    delete process.env.CLAWSPRAWL_PRIVATE_TOKEN;

    const cookies = createCookies();
    expect((await getPrivateDashboard({ cookies } as any)).status).toBe(200);
    expect((await getPrivateHealth({ cookies } as any)).status).toBe(200);
    expect((await getPrivateEvents({ cookies } as any)).status).toBe(200);
  });

  it('returns public and private SSE streams with expected event shapes', async () => {
    const setIntervalMock = vi.spyOn(globalThis, 'setInterval').mockImplementation((cb: TimerHandler) => {
      if (typeof cb === 'function') cb();
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    const publicResponse = await getPublicEvents({} as any);
    expect(publicResponse.status).toBe(200);
    const publicReader = publicResponse.body?.getReader();
    const publicChunk = await publicReader?.read();
    const publicText = publicChunk?.value ? new TextDecoder().decode(publicChunk.value) : '';
    expect(publicText).toContain('event: snapshot-updated');
    expect(publicText).not.toContain('gateway-event');
    await publicReader?.cancel();

    const cookies = createCookies();
    await postPrivateSession({
      request: new Request('http://localhost/api/private/session', {
        method: 'POST',
        headers: { authorization: 'Bearer private-token' },
      }),
      cookies,
    } as any);
    const privateResponse = await getPrivateEvents({ cookies } as any);
    expect(privateResponse.status).toBe(200);
    const privateReader = privateResponse.body?.getReader();
    const privateChunk = await privateReader?.read();
    const privateText = privateChunk?.value ? new TextDecoder().decode(privateChunk.value) : '';
    expect(privateText).toContain('event: gateway-event');
    await privateReader?.cancel();

    setIntervalMock.mockRestore();
  });
});
