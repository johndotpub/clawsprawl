import { describe, expect, it } from 'vitest';
import { buildPrivateEvent, buildPublicEvent, buildPublicSnapshot } from './public-private';

const snapshot = {
  connectionState: 'connected',
  lastUpdatedAt: '2026-04-12T00:00:00.000Z',
  lastSuccessfulSnapshotAt: '2026-04-12T00:00:00.000Z',
  stale: false,
  reconnectCount: 1,
  errorCount: 2,
  agents: [{ id: 'ceo', workspace: '/home/private/workspace' }],
  sessions: [{ key: 'agent:ceo:main' }],
  cronJobs: [],
  cronRuns: [],
  models: [],
  health: {
    ok: true,
    ts: 123,
    durationMs: 8,
    heartbeatSeconds: 30,
    channelOrder: ['slack'],
    channelLabels: { slack: 'Slack' },
    channels: {
      slack: { running: true, probeOk: true, botUsername: 'secret-bot', lastError: 'bad things' },
    },
  },
  status: {
    ok: true,
    runtimeVersion: '2026.4.11',
    sessions: { count: 1, byAgent: [{ agentId: 'ceo', count: 1 }] },
    heartbeat: {
      defaultAgentId: 'ceo',
      agents: [{ agentId: 'ceo', enabled: true, every: '10m', everyMs: 600000 }],
    },
  },
  presence: [{ host: 'private-host' }],
  usageCost: null,
  usageStatus: {
    updatedAt: 1,
    providers: [{ provider: 'openai', status: 'ok', used: 100, limit: 1000, remaining: 900, resetAt: 123 }],
  },
  toolsCatalog: null,
  skillsStatus: {
    workspaceDir: '/private/skills/workspace',
    managedSkillsDir: '/private/skills/managed',
    skills: [
      {
        name: 'taskflow',
        description: 'workflow orchestration',
        source: 'bundled',
        bundled: true,
        emoji: ':brain:',
        homepage: 'https://example.com/skill/taskflow',
        always: false,
        disabled: false,
        eligible: true,
        missing: { bins: ['bash'], env: ['OPENAI_API_KEY'] },
      },
    ],
  },
  channelsStatus: {
    channelOrder: ['slack'],
    channelLabels: { slack: 'Slack' },
    channels: { slack: { running: true } },
    channelAccounts: {
      slack: [{ connected: true, bot: { username: 'secret-bot' }, lastError: 'bad things', reconnectAttempts: 2 }],
    },
  },
  cronScheduler: {
    enabled: true,
    jobs: 2,
    nextWakeAtMs: 123,
    storePath: '/private/cron/jobs.db',
  },
  memoryStatus: null,
  configData: { logLevel: 'debug' },
  fileStatus: [{ path: 'src/index.ts', status: 'modified' }],
  sessionDetails: [{ key: 'agent:ceo:main', status: 'running' }],
  sessionsByAgent: new Map([['ceo', 1]]),
  serverVersion: '2026.4.11',
  availableMethods: ['status', 'config.get'],
  availableEvents: ['session.tool'],
};

describe('public/private dashboard shaping', () => {
  it('removes private top-level fields from the public snapshot', () => {
    const publicSnapshot = buildPublicSnapshot(snapshot as any);
    expect(publicSnapshot.sessions).toEqual([]);
    expect(publicSnapshot.presence).toEqual([]);
    expect(publicSnapshot.configData).toBeNull();
    expect(publicSnapshot.fileStatus).toBeNull();
    expect(publicSnapshot.sessionDetails).toBeNull();
    expect(publicSnapshot.usageStatus).toBeNull();
    expect(publicSnapshot.availableEvents).toEqual([]);
    expect(publicSnapshot.availableMethods).toEqual([]);
    expect(publicSnapshot.serverVersion).toBeNull();
    expect(publicSnapshot.agents).toEqual([{ id: 'ceo' }]);
    expect(publicSnapshot.skillsStatus?.workspaceDir).toBe('');
    expect(publicSnapshot.skillsStatus?.managedSkillsDir).toBe('');
    expect(publicSnapshot.skillsStatus?.skills?.[0]?.missing).toBeUndefined();
    expect(publicSnapshot.cronScheduler).toEqual({ enabled: true, jobs: 2, nextWakeAtMs: 123 });
    expect(publicSnapshot.health?.channels?.slack).toEqual({ running: true, probeOk: true });
    expect(publicSnapshot.channelsStatus?.channelAccounts?.slack?.[0]).toMatchObject({
      connected: true,
      reconnectAttempts: expect.any(Number),
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    });
    expect(JSON.stringify(publicSnapshot)).not.toContain('secret-bot');
    expect(JSON.stringify(publicSnapshot)).not.toContain('bad things');
    expect(JSON.stringify(publicSnapshot)).not.toContain('private-host');
    expect(JSON.stringify(publicSnapshot)).not.toContain('/private/');
    expect(JSON.stringify(publicSnapshot)).not.toContain('OPENAI_API_KEY');
  });

  it('never exposes raw gateway events publicly', () => {
    expect(buildPublicEvent({ type: 'event', event: 'session.tool', payload: { tool: 'bash' } } as any)).toBeNull();
    expect(buildPrivateEvent({ type: 'event', event: 'session.tool', payload: { tool: 'bash' } } as any)).toMatchObject({ event: 'session.tool' });
  });

  it('preserves public-safe status session and heartbeat summaries', () => {
    const enriched = {
      ...snapshot,
      agents: [{ id: 'ceo', name: 'Chief', model: 'openai/gpt-5' }],
      status: {
        ok: true,
        runtimeVersion: '2026.4.14',
        sessions: {
          count: 2,
          byAgent: [{ agentId: 'ceo', count: 2, path: '/private/path' }],
        },
        heartbeat: {
          defaultAgentId: 'ceo',
          agents: [{ agentId: 'ceo', enabled: true, every: '10m', everyMs: 600000 }],
        },
      },
    };

    const publicSnapshot = buildPublicSnapshot(enriched as any);
    expect(publicSnapshot.agents).toEqual([{ id: 'ceo', name: 'Chief', model: 'openai/gpt-5' }]);
    expect(publicSnapshot.status?.sessions).toEqual({
      count: 2,
      byAgent: [{ agentId: 'ceo', count: 2 }],
    });
    expect(publicSnapshot.status?.heartbeat).toEqual({
      defaultAgentId: 'ceo',
      agents: [{ agentId: 'ceo', enabled: true, every: '10m', everyMs: 600000 }],
    });
    expect(JSON.stringify(publicSnapshot)).not.toContain('/private/path');
  });

  it('handles missing optional sections by returning null summaries', () => {
    const minimal = {
      ...snapshot,
      health: null,
      status: null,
      channelsStatus: null,
      skillsStatus: null,
      cronScheduler: null,
    };

    const publicSnapshot = buildPublicSnapshot(minimal as any);
    expect(publicSnapshot.health).toBeNull();
    expect(publicSnapshot.status).toBeNull();
    expect(publicSnapshot.channelsStatus).toBeNull();
    expect(publicSnapshot.skillsStatus).toBeNull();
    expect(publicSnapshot.cronScheduler).toBeNull();
  });

  it('falls back safely when health/status nested shapes are malformed', () => {
    const malformed = {
      ...snapshot,
      health: {
        ok: true,
        ts: 99,
        channels: {
          slack: 'unexpected',
        },
      },
      status: {
        ok: true,
        sessions: {
          count: 3,
          byAgent: 'unexpected',
        },
        heartbeat: {
          defaultAgentId: 'ceo',
          agents: 'unexpected',
        },
      },
    };

    const publicSnapshot = buildPublicSnapshot(malformed as any);
    expect(publicSnapshot.health?.channelOrder).toEqual(['slack']);
    expect(publicSnapshot.health?.channels?.slack).toEqual({ running: false, probeOk: false });
    expect(publicSnapshot.status?.sessions).toEqual({ count: 3, byAgent: [] });
    expect(publicSnapshot.status?.heartbeat).toEqual({ defaultAgentId: 'ceo', agents: [] });
  });
});
