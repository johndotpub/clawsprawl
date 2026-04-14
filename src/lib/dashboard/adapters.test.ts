import { describe, expect, it } from 'vitest';
import {
  asNumber,
  asString,
  countSessionsByAgent,
  extractChannelHealth,
  extractCronRunError,
  extractDefaultAgentId,
  extractSessionCount,
  formatEventPreview,
  formatTokenCount,
  latestCronRunsByJob,
  normalizeAgents,
  normalizeChannelsStatus,
  normalizeConfigData,
  normalizeCronJobs,
  normalizeCronRuns,
  normalizeCronScheduler,
  normalizeFileStatus,
  normalizeHealth,
  normalizeMemoryStatus,
  normalizeModels,
  normalizePresence,
  normalizeSessionDetails,
  normalizeSessions,
  normalizeSkillsStatus,
  normalizeStatus,
  normalizeToolsCatalog,
  normalizeUsageCost,
  normalizeUsageStatus,
  summarizeProviderHealth,
} from './adapters';

describe('dashboard adapters', () => {
  // --- asString ---

  it('asString returns value when string, fallback otherwise', () => {
    expect(asString('hello', 'default')).toBe('hello');
    expect(asString(42, 'default')).toBe('default');
    expect(asString(null, 'default')).toBe('default');
    expect(asString(undefined, 'default')).toBe('default');
    expect(asString('', 'default')).toBe('');
  });

  // --- asNumber ---

  it('asNumber returns value when number, fallback otherwise', () => {
    expect(asNumber(42, 0)).toBe(42);
    expect(asNumber(0, 99)).toBe(0);
    expect(asNumber(-1, 0)).toBe(-1);
    expect(asNumber('not a number', 0)).toBe(0);
    expect(asNumber(null, 0)).toBe(0);
    expect(asNumber(undefined, 0)).toBe(0);
  });

  // --- normalizeAgents ---

  it('normalizes agents from bare array and provides fallback ids', () => {
    const agents = normalizeAgents([{ id: 'ceo' }, { name: 'ops' }]);
    expect(agents[0]?.id).toBe('ceo');
    expect(agents[1]?.id).toBe('agent-1');
  });

  it('normalizes agents from wrapped response { agents: [...] }', () => {
    const agents = normalizeAgents({
      defaultId: 'ceo',
      mainKey: 'agent:ceo:main',
      scope: 'full',
      agents: [
        { id: 'ceo', workspace: 'main', model: { primary: 'ollama-cloud/qwen3.5:cloud', fallbacks: [] } },
        { id: 'ops', workspace: 'ops', model: { primary: 'openai/gpt-5.3-codex' } },
      ],
    });
    expect(agents).toHaveLength(2);
    expect(agents[0]?.id).toBe('ceo');
    expect(agents[1]?.id).toBe('ops');
  });

  // --- extractDefaultAgentId ---

  it('extracts defaultId from agents.list response', () => {
    expect(extractDefaultAgentId({ defaultId: 'ceo', agents: [] })).toBe('ceo');
    expect(extractDefaultAgentId({ agents: [] })).toBeUndefined();
    expect(extractDefaultAgentId([])).toBeUndefined();
  });

  // --- normalizeSessions ---

  it('normalizes sessions from bare array with id field', () => {
    const sessions = normalizeSessions([
      { id: 's1', agentId: 'ceo' },
      { id: 's2', agentId: 'ceo' },
      { id: 's3', agentId: 'ops' },
    ]);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]?.agentId).toBe('ceo');
  });

  it('normalizes sessions from wrapped response { sessions: [...] }', () => {
    const sessions = normalizeSessions({
      ts: 1712345678000,
      path: '/sessions',
      count: 98,
      defaults: { modelProvider: 'ollama-cloud', model: 'qwen3.5:cloud', contextTokens: 128000 },
      sessions: [
        { key: 'agent:ceo:main', kind: 'persistent', displayName: 'CEO Main', channel: 'discord' },
        { key: 'agent:ops:deploy', kind: 'ephemeral', displayName: 'Ops Deploy' },
      ],
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.key).toBe('agent:ceo:main');
    expect(sessions[0]?.agentId).toBe('ceo');
    expect(sessions[1]?.agentId).toBe('ops');
  });

  it('extracts agentId from session key pattern agent:X:Y', () => {
    const sessions = normalizeSessions([{ key: 'agent:bofh:scratch' }]);
    expect(sessions[0]?.agentId).toBe('bofh');
  });

  it('counts sessions by agent', () => {
    const sessions = normalizeSessions([
      { id: 's1', agentId: 'ceo' },
      { id: 's2', agentId: 'ceo' },
      { id: 's3', agentId: 'ops' },
    ]);
    const counts = countSessionsByAgent(sessions);
    expect(counts.get('ceo')).toBe(2);
    expect(counts.get('ops')).toBe(1);
  });

  // --- extractSessionCount ---

  it('extracts session count from wrapped response', () => {
    expect(extractSessionCount({ count: 98, sessions: [] })).toBe(98);
    expect(extractSessionCount([])).toBe(0);
    expect(extractSessionCount({ sessions: [] })).toBe(0);
  });

  // --- normalizeCronJobs / normalizeCronRuns ---

  it('normalizes cron jobs from bare array', () => {
    const jobs = normalizeCronJobs([{ name: 'daily', status: 'ok' }, {}]);
    expect(jobs[0]?.name).toBe('daily');
    expect(jobs[1]?.name).toBe('cron-job-1');
  });

  it('normalizes cron jobs from wrapped response { jobs: [...] }', () => {
    const jobs = normalizeCronJobs({
      jobs: [
        { id: 'j1', name: 'daily-backup', enabled: true, schedule: { kind: 'cron', expr: '0 6 * * *', tz: 'UTC' } },
      ],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe('daily-backup');
    expect(jobs[0]?.id).toBe('j1');
  });

  it('normalizes cron runs from bare array', () => {
    const runs = normalizeCronRuns([{ jobId: 'j1', status: 'ok', ts: 123 }]);
    expect(runs).toHaveLength(1);
  });

  it('normalizes cron runs from wrapped response { entries: [...] }', () => {
    const runs = normalizeCronRuns({
      entries: [
        { ts: 1712345678000, jobId: 'j1', action: 'run', status: 'ok', summary: 'Completed in 2s' },
      ],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.jobId).toBe('j1');
  });

  // --- normalizeModels ---

  it('extracts provider from model id when missing', () => {
    const models = normalizeModels([{ id: 'ollama-cloud/qwen3.5:cloud' }]);
    expect(models[0]?.provider).toBe('ollama-cloud');
  });

  it('normalizes models from wrapped response { models: [...] }', () => {
    const models = normalizeModels({
      models: [
        { id: 'ollama-cloud/qwen3.5:cloud', name: 'qwen3.5:cloud', provider: 'ollama-cloud', contextWindow: 128000, reasoning: false },
        { id: 'openai/gpt-5.3-codex', name: 'gpt-5.3-codex', provider: 'openai' },
      ],
    });
    expect(models).toHaveLength(2);
    expect(models[0]?.provider).toBe('ollama-cloud');
    expect(models[1]?.provider).toBe('openai');
  });

  // --- formatEventPreview ---

  it('formats concise event previews', () => {
    const text = formatEventPreview({ event: 'heartbeat', payload: { ok: true } });
    expect(text).toContain('heartbeat');
    expect(text).toContain('ok');
  });

  it('adds ellipsis when event payload exceeds 120 characters', () => {
    const longPayload = { data: 'x'.repeat(200) };
    const text = formatEventPreview({ event: 'big', payload: longPayload });
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(200);
  });

  it('does not add ellipsis when event payload is short', () => {
    const text = formatEventPreview({ event: 'small', payload: { ok: true } });
    expect(text).not.toContain('…');
  });

  // --- summarizeProviderHealth ---

  it('summarizes provider health purely from live model data', () => {
    const models = normalizeModels([{ id: 'ollama-cloud/qwen3.5:cloud' }, { id: 'openai/gpt-5.3-codex' }]);
    const summary = summarizeProviderHealth(models);

    const byProvider = new Map(summary.map((entry) => [entry.provider, entry]));
    expect(byProvider.get('ollama-cloud')?.status).toBe('healthy');
    expect(byProvider.get('openai')?.status).toBe('healthy');
    expect(byProvider.size).toBe(2);
    // No phantom degraded entries for absent providers
    expect(byProvider.has('ollama-5090')).toBe(false);
  });

  it('returns empty array when no models are loaded', () => {
    const summary = summarizeProviderHealth([]);
    expect(summary).toHaveLength(0);
  });

  // --- latestCronRunsByJob ---

  it('maps latest cron runs by jobId and extracts error text', () => {
    const runMap = latestCronRunsByJob([
      { jobId: 'daily-backup', status: 'error', error: 'Unknown Channel', ts: 2 },
      { jobId: 'daily-backup', status: 'ok', ts: 1 },
      { jobId: 'workspace-cleanup-daily', status: 'ok', ts: 3 },
    ]);

    expect(runMap.get('daily-backup')?.status).toBe('error');
    expect(extractCronRunError(runMap.get('daily-backup'))).toBe('Unknown Channel');
    expect(extractCronRunError(runMap.get('workspace-cleanup-daily'))).toBe('');
  });

  it('falls back to jobName for legacy compatibility', () => {
    const runMap = latestCronRunsByJob([
      { jobName: 'legacy-job', status: 'ok', ts: 1 },
    ] as any[]);
    expect(runMap.get('legacy-job')?.status).toBe('ok');
  });

  it('extracts error from nested object with message field', () => {
    const error = extractCronRunError({
      jobId: 'j1',
      ts: 1,
      error: { message: 'Connection refused', code: 'ECONNREFUSED' },
    });
    expect(error).toBe('Connection refused');
  });

  it('returns empty string for nested error object without message', () => {
    const error = extractCronRunError({
      jobId: 'j1',
      ts: 1,
      error: { code: 'UNKNOWN' },
    } as any);
    expect(error).toBe('');
  });

  // --- normalizeHealth ---

  it('normalizes health response with channels and agents', () => {
    const health = normalizeHealth({
      ok: true,
      ts: 1712345678000,
      durationMs: 450,
      channels: { discord: { configured: true, running: false } },
      channelOrder: ['discord'],
      channelLabels: { discord: 'Discord' },
      heartbeatSeconds: 86400,
      defaultAgentId: 'ceo',
      agents: [{ agentId: 'ceo', isDefault: true }],
    });

    expect(health.ok).toBe(true);
    expect(health.ts).toBe(1712345678000);
    expect(health.durationMs).toBe(450);
    expect(health.channelOrder).toEqual(['discord']);
    expect(health.channelLabels?.discord).toBe('Discord');
    expect(health.heartbeatSeconds).toBe(86400);
    expect(health.defaultAgentId).toBe('ceo');
    expect(health.agents).toHaveLength(1);
  });

  it('normalizes health with missing optional fields', () => {
    const health = normalizeHealth({ ok: false, ts: 0 });
    expect(health.ok).toBe(false);
    expect(health.ts).toBe(0);
    expect(health.durationMs).toBeUndefined();
    expect(health.channels).toBeUndefined();
    expect(health.channelOrder).toBeUndefined();
  });

  it('normalizes health from empty/null input', () => {
    const health = normalizeHealth(null);
    expect(health.ok).toBe(false);
    expect(health.ts).toBe(0);
  });

  // --- normalizeStatus ---

  it('normalizes full status response with tasks, audit, and sessions', () => {
    const status = normalizeStatus({
      runtimeVersion: '2026.4.5',
      tasks: { total: 1487, active: 109, terminal: 1378, failures: 19, byStatus: {}, byRuntime: { cli: 1381 } },
      taskAudit: { total: 146, warnings: 37, errors: 109, byCode: { stale_running: 109 } },
      channelSummary: ['Discord: configured'],
      sessions: {
        count: 102,
        byAgent: [{ agentId: 'ceo', count: 30 }, { agentId: 'ops', count: 72 }],
      },
      heartbeat: { defaultAgentId: 'ceo', agents: [] },
    });

    expect(status.ok).toBe(true);
    expect(status.runtimeVersion).toBe('2026.4.5');
    expect(status.tasks?.total).toBe(1487);
    expect(status.tasks?.active).toBe(109);
    expect(status.tasks?.byRuntime?.cli).toBe(1381);
    expect(status.taskAudit?.warnings).toBe(37);
    expect(status.taskAudit?.errors).toBe(109);
    expect(status.channelSummary).toEqual(['Discord: configured']);
    expect(status.sessions?.count).toBe(102);
    expect(status.sessions?.byAgent).toHaveLength(2);
    expect(status.sessions?.byAgent?.[0]?.agentId).toBe('ceo');
  });

  it('normalizes status from minimal input', () => {
    const status = normalizeStatus({});
    expect(status.ok).toBe(true);
    expect(status.runtimeVersion).toBeUndefined();
    expect(status.tasks).toBeUndefined();
  });

  it('normalizes status from null input', () => {
    const status = normalizeStatus(null);
    expect(status.ok).toBe(true);
  });

  // --- normalizePresence ---

  it('normalizes presence entries from array', () => {
    const presence = normalizePresence([
      { ts: 1712345678000, host: 'workstation-a', ip: '127.0.0.1', version: '0.16.0', platform: 'linux', mode: 'webchat', reason: 'connect' },
      { ts: 1712345679000, host: 'phone-b', platform: 'ios', deviceFamily: 'iphone' },
    ]);

    expect(presence).toHaveLength(2);
    expect(presence[0]?.host).toBe('workstation-a');
    expect(presence[0]?.version).toBe('0.16.0');
    expect(presence[0]?.mode).toBe('webchat');
    expect(presence[1]?.platform).toBe('ios');
    expect(presence[1]?.deviceFamily).toBe('iphone');
  });

  it('normalizes presence from empty/null input', () => {
    expect(normalizePresence(null)).toEqual([]);
    expect(normalizePresence([])).toEqual([]);
    expect(normalizePresence(undefined)).toEqual([]);
  });

  it('handles presence entries with missing fields gracefully', () => {
    const presence = normalizePresence([{}]);
    expect(presence).toHaveLength(1);
    expect(presence[0]?.ts).toBe(0);
    expect(presence[0]?.host).toBeUndefined();
  });

  // --- extractChannelHealth ---

  it('extracts channel health summaries from health response', () => {
    const health = normalizeHealth({
      ok: true,
      ts: 1712345678000,
      channels: {
        discord: {
          configured: true,
          running: false,
          probe: { ok: true, elapsedMs: 120, bot: { id: '123', username: 'TestBot' } },
        },
      },
      channelOrder: ['discord'],
      channelLabels: { discord: 'Discord' },
    });

    const channels = extractChannelHealth(health);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.channel).toBe('discord');
    expect(channels[0]?.label).toBe('Discord');
    expect(channels[0]?.configured).toBe(true);
    expect(channels[0]?.running).toBe(false);
    expect(channels[0]?.probeOk).toBe(true);
    expect(channels[0]?.probeMs).toBe(120);
    expect(channels[0]?.botUsername).toBe('TestBot');
    expect(channels[0]?.lastError).toBeNull();
  });

  it('extracts channel health with probe failure and error', () => {
    const health = normalizeHealth({
      ok: false,
      ts: 0,
      channels: {
        slack: {
          configured: true,
          running: true,
          probe: { ok: false },
          lastError: 'Connection timeout',
        },
      },
      channelOrder: ['slack'],
    });

    const channels = extractChannelHealth(health);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.probeOk).toBe(false);
    expect(channels[0]?.probeMs).toBeNull();
    expect(channels[0]?.botUsername).toBeNull();
    expect(channels[0]?.lastError).toBe('Connection timeout');
  });

  it('returns empty array when health is null', () => {
    expect(extractChannelHealth(null)).toEqual([]);
  });

  it('returns empty array when health has no channels', () => {
    const health = normalizeHealth({ ok: true, ts: 0 });
    expect(extractChannelHealth(health)).toEqual([]);
  });

  // --- formatTokenCount ---

  it('formats token counts compactly', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(1_234)).toBe('1.2k');
    expect(formatTokenCount(30_386_855)).toBe('30.4M');
    expect(formatTokenCount(1_500_000_000)).toBe('1.5B');
  });

  it('formats token counts with trimZero for clean round numbers', () => {
    expect(formatTokenCount(1_000, true)).toBe('1k');
    expect(formatTokenCount(256_000, true)).toBe('256k');
    expect(formatTokenCount(1_000_000, true)).toBe('1M');
    expect(formatTokenCount(1_500_000, true)).toBe('1.5M');
    expect(formatTokenCount(1_000_000_000, true)).toBe('1B');
  });

  // --- normalizeUsageCost ---

  it('normalizes usage.cost response with daily breakdown and totals', () => {
    const result = normalizeUsageCost({
      updatedAt: 1712345678000,
      days: 31,
      daily: [
        { date: '2026-04-01', input: 1000, output: 200, cacheRead: 50, cacheWrite: 10, totalTokens: 1260, totalCost: 0.01 },
        { date: '2026-04-02', input: 2000, output: 400, cacheRead: 100, cacheWrite: 20, totalTokens: 2520, totalCost: 0.02 },
      ],
      totals: { input: 3000, output: 600, cacheRead: 150, cacheWrite: 30, totalTokens: 3780, totalCost: 0.03 },
    });

    expect(result.updatedAt).toBe(1712345678000);
    expect(result.days).toBe(31);
    expect(result.daily).toHaveLength(2);
    expect(result.daily[0]?.date).toBe('2026-04-01');
    expect(result.daily[0]?.input).toBe(1000);
    expect(result.totals.totalTokens).toBe(3780);
    expect(result.totals.totalCost).toBe(0.03);
  });

  it('normalizes usage.cost from empty/null input', () => {
    const result = normalizeUsageCost(null);
    expect(result.updatedAt).toBe(0);
    expect(result.daily).toEqual([]);
    expect(result.totals.totalTokens).toBe(0);
  });

  it('normalizes usage.cost with missing daily fields', () => {
    const result = normalizeUsageCost({ daily: [{ date: '2026-04-01' }], totals: {} });
    expect(result.daily[0]?.input).toBe(0);
    expect(result.daily[0]?.totalCost).toBe(0);
    expect(result.totals.input).toBe(0);
  });

  // --- normalizeUsageStatus ---

  it('normalizes usage.status provider summaries', () => {
    const result = normalizeUsageStatus({
      ts: 1712345678000,
      providers: [
        { provider: 'openai', status: 'ok', used: 1200, limit: 10000, remaining: 8800, resetAt: 1712400000000 },
        { provider: 'anthropic', status: 'warn', current: 500, quota: 1000, left: 500, resetAtMs: 1712400000000 },
      ],
    });

    expect(result.updatedAt).toBe(1712345678000);
    expect(result.providers).toHaveLength(2);
    expect(result.providers[0]).toMatchObject({ provider: 'openai', status: 'ok', used: 1200, limit: 10000, remaining: 8800 });
    expect(result.providers[1]).toMatchObject({ provider: 'anthropic', status: 'warn', used: 500, limit: 1000, remaining: 500 });
  });

  it('normalizes usage.status from alternate windows shape', () => {
    const result = normalizeUsageStatus({ windows: [{ id: 'provider-x', consumed: 99, max: 100, windowEndsAt: 123 }] });
    expect(result.providers[0]).toMatchObject({
      provider: 'provider-x',
      used: 99,
      limit: 100,
      resetAt: 123,
    });
  });

  // --- normalizeToolsCatalog ---

  it('normalizes tools.catalog response with groups and tools', () => {
    const result = normalizeToolsCatalog({
      agentId: 'ceo',
      profiles: [{ id: 'default', label: 'Default' }],
      groups: [
        {
          id: 'fs',
          label: 'Files',
          source: 'core',
          tools: [
            { id: 'read', label: 'Read File', description: 'Read a file', source: 'core', defaultProfiles: ['default'] },
            { id: 'write', label: 'Write File', description: 'Write a file', source: 'core' },
          ],
        },
      ],
    });

    expect(result.agentId).toBe('ceo');
    expect(result.profiles).toHaveLength(1);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.label).toBe('Files');
    expect(result.groups[0]?.tools).toHaveLength(2);
    expect(result.groups[0]?.tools[0]?.id).toBe('read');
    expect(result.groups[0]?.tools[0]?.defaultProfiles).toEqual(['default']);
  });

  it('normalizes tools.catalog from empty/null input', () => {
    const result = normalizeToolsCatalog(null);
    expect(result.agentId).toBe('');
    expect(result.profiles).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  // --- normalizeSkillsStatus ---

  it('normalizes skills.status response with skills inventory', () => {
    const result = normalizeSkillsStatus({
      workspaceDir: '/home/user/project',
      managedSkillsDir: '/home/user/.openclaw/skills',
      skills: [
        { name: 'git', description: 'Git operations', source: 'bundled', bundled: true, emoji: '🔧', always: true, disabled: false, eligible: true, missing: { bins: [], env: [] } },
        { name: 'docker', description: 'Docker ops', source: 'community', bundled: false, eligible: false, missing: { bins: ['docker'], env: ['DOCKER_HOST'] } },
      ],
    });

    expect(result.workspaceDir).toBe('/home/user/project');
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0]?.name).toBe('git');
    expect(result.skills[0]?.bundled).toBe(true);
    expect(result.skills[0]?.emoji).toBe('🔧');
    expect(result.skills[0]?.eligible).toBe(true);
    expect(result.skills[1]?.eligible).toBe(false);
    expect(result.skills[1]?.missing.bins).toEqual(['docker']);
    expect(result.skills[1]?.missing.env).toEqual(['DOCKER_HOST']);
  });

  it('normalizes skills.status from empty/null input', () => {
    const result = normalizeSkillsStatus(null);
    expect(result.workspaceDir).toBe('');
    expect(result.skills).toEqual([]);
  });

  // --- normalizeChannelsStatus ---

  it('normalizes channels.status response with channel accounts', () => {
    const result = normalizeChannelsStatus({
      ts: 1712345678000,
      channelOrder: ['discord'],
      channelLabels: { discord: 'Discord' },
      channels: {
        discord: { configured: true, running: true, lastStartAt: 1712345000000, lastStopAt: null, lastError: null },
      },
      channelAccounts: {
        discord: [
          {
            accountId: 'main',
            enabled: true,
            configured: true,
            running: true,
            connected: true,
            lastInboundAt: 1712345600000,
            lastOutboundAt: 1712345500000,
            reconnectAttempts: 0,
            bot: { id: '123456', username: 'ClawBot' },
          },
        ],
      },
    });

    expect(result.ts).toBe(1712345678000);
    expect(result.channelOrder).toEqual(['discord']);
    expect(result.channelLabels.discord).toBe('Discord');
    expect(result.channels.discord?.configured).toBe(true);
    expect(result.channels.discord?.running).toBe(true);
    expect(result.channelAccounts.discord).toHaveLength(1);
    expect(result.channelAccounts.discord?.[0]?.accountId).toBe('main');
    expect(result.channelAccounts.discord?.[0]?.connected).toBe(true);
    expect(result.channelAccounts.discord?.[0]?.bot?.username).toBe('ClawBot');
  });

  it('normalizes channels.status from empty/null input', () => {
    const result = normalizeChannelsStatus(null);
    expect(result.ts).toBe(0);
    expect(result.channelOrder).toEqual([]);
    expect(result.channels).toEqual({});
    expect(result.channelAccounts).toEqual({});
  });

  // --- normalizeCronScheduler ---

  it('normalizes cron.status response', () => {
    const result = normalizeCronScheduler({
      enabled: true,
      storePath: '/data/cron.db',
      jobs: 7,
      nextWakeAtMs: 1712346000000,
    });

    expect(result.enabled).toBe(true);
    expect(result.jobs).toBe(7);
    expect(result.nextWakeAtMs).toBe(1712346000000);
    expect(result.storePath).toBe('/data/cron.db');
  });

  it('normalizes cron.status from empty/null input', () => {
    const result = normalizeCronScheduler(null);
    expect(result.enabled).toBe(false);
    expect(result.jobs).toBe(0);
    expect(result.nextWakeAtMs).toBeNull();
  });

  // --- normalizeMemoryStatus ---

  it('normalizes doctor.memory.status response with dreaming phases', () => {
    const result = normalizeMemoryStatus({
      agentId: 'ceo',
      provider: 'ollama-cloud',
      embedding: { ok: true },
      dreaming: {
        enabled: true,
        phases: {
          light: { enabled: true, cron: '*/5 * * * *', lookbackDays: 7, limit: 100 },
          deep: { enabled: false, cron: '0 3 * * *' },
        },
        shortTermCount: 42,
        recallSignalCount: 15,
        totalSignalCount: 200,
        promotedTotal: 50,
        promotedToday: 3,
      },
    });

    expect(result.agentId).toBe('ceo');
    expect(result.provider).toBe('ollama-cloud');
    expect(result.embedding.ok).toBe(true);
    expect(result.dreaming.enabled).toBe(true);
    expect(result.dreaming.phases.light?.enabled).toBe(true);
    expect(result.dreaming.phases.light?.cron).toBe('*/5 * * * *');
    expect(result.dreaming.phases.deep?.enabled).toBe(false);
    expect(result.dreaming.shortTermCount).toBe(42);
    expect(result.dreaming.totalSignalCount).toBe(200);
    expect(result.dreaming.promotedTotal).toBe(50);
    expect(result.dreaming.promotedToday).toBe(3);
  });

  it('normalizes doctor.memory.status from empty/null input', () => {
    const result = normalizeMemoryStatus(null);
    expect(result.agentId).toBe('');
    expect(result.embedding.ok).toBe(false);
    expect(result.dreaming.enabled).toBe(false);
    expect(result.dreaming.totalSignalCount).toBe(0);
  });

  // --- normalizeConfigData ---

  it('normalizes config data from object', () => {
    const result = normalizeConfigData({ port: 18789, debug: false, agents: ['ceo', 'ops'] });
    expect(result.port).toBe(18789);
    expect(result.debug).toBe(false);
    expect(result.agents).toEqual(['ceo', 'ops']);
  });

  it('normalizes config data from null input', () => {
    const result = normalizeConfigData(null);
    expect(result).toEqual({});
  });

  // --- normalizeFileStatus ---

  it('normalizes file/status from bare array', () => {
    const result = normalizeFileStatus([
      { path: 'src/index.ts', status: 'modified', language: 'typescript', sizeBytes: 1024, modifiedAt: 1712345678000 },
      { path: 'README.md', status: 'added' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe('src/index.ts');
    expect(result[0]?.status).toBe('modified');
    expect(result[0]?.language).toBe('typescript');
    expect(result[0]?.sizeBytes).toBe(1024);
    expect(result[0]?.modifiedAt).toBe(1712345678000);
    expect(result[1]?.path).toBe('README.md');
    expect(result[1]?.status).toBe('added');
    expect(result[1]?.language).toBeUndefined();
  });

  it('normalizes file/status from wrapped response { files: [...] }', () => {
    const result = normalizeFileStatus({
      files: [
        { path: 'package.json', status: 'modified' },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('package.json');
  });

  it('normalizes file/status from empty/null input', () => {
    expect(normalizeFileStatus(null)).toEqual([]);
    expect(normalizeFileStatus([])).toEqual([]);
    expect(normalizeFileStatus(undefined)).toEqual([]);
  });

  it('provides fallback values for missing file status fields', () => {
    const result = normalizeFileStatus([{}]);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('unknown');
    expect(result[0]?.status).toBe('unknown');
  });

  // --- normalizeSessionDetails ---

  it('normalizes session details from bare array', () => {
    const result = normalizeSessionDetails([
      { key: 'agent:ceo:main', agentId: 'ceo', status: 'running', displayName: 'CEO Main', messageCount: 42, tokenCount: 1200 },
      { key: 'agent:ops:deploy', agentId: 'ops', status: 'idle' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.key).toBe('agent:ceo:main');
    expect(result[0]?.agentId).toBe('ceo');
    expect(result[0]?.status).toBe('running');
    expect(result[0]?.displayName).toBe('CEO Main');
    expect(result[0]?.messageCount).toBe(42);
    expect(result[0]?.tokenCount).toBe(1200);
    expect(result[1]?.key).toBe('agent:ops:deploy');
    expect(result[1]?.status).toBe('idle');
  });

  it('normalizes session details from name-keyed map', () => {
    const result = normalizeSessionDetails({
      'agent:ceo:main': { agentId: 'ceo', status: 'running', displayName: 'CEO Main', kind: 'persistent', channel: 'discord' },
      'agent:ops:scratch': { agentId: 'ops', status: 'idle', kind: 'ephemeral' },
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.key).toBe('agent:ceo:main');
    expect(result[0]?.agentId).toBe('ceo');
    expect(result[0]?.kind).toBe('persistent');
    expect(result[0]?.channel).toBe('discord');
    expect(result[1]?.key).toBe('agent:ops:scratch');
    expect(result[1]?.kind).toBe('ephemeral');
  });

  it('normalizes session details from sessions.list envelope', () => {
    const result = normalizeSessionDetails({
      ts: 1712345678000,
      path: '/state/sessions',
      count: 2,
      sessions: [
        { key: 'agent:ceo:main', agentId: 'ceo', status: 'running', displayName: 'CEO Main', channel: 'discord' },
        { key: 'agent:ops:deploy', status: 'idle', kind: 'ephemeral' },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.key).toBe('agent:ceo:main');
    expect(result[0]?.agentId).toBe('ceo');
    expect(result[0]?.status).toBe('running');
    expect(result[0]?.channel).toBe('discord');
    expect(result[1]?.key).toBe('agent:ops:deploy');
    expect(result[1]?.agentId).toBe('ops');
    expect(result[1]?.status).toBe('idle');
  });

  it('derives agentId from session key when not explicitly provided', () => {
    const result = normalizeSessionDetails([
      { key: 'agent:finance:main' },
      { key: 'agent:hr:scratch', agentId: 'hr-override' },
      { key: 'some-other-key' },
    ]);

    expect(result[0]?.agentId).toBe('finance');
    expect(result[1]?.agentId).toBe('hr-override');
    expect(result[2]?.agentId).toBe('');
  });

  it('normalizes session details from null/empty input', () => {
    expect(normalizeSessionDetails(null)).toEqual([]);
    expect(normalizeSessionDetails([])).toEqual([]);
    expect(normalizeSessionDetails(undefined)).toEqual([]);
  });

  it('provides fallback values for missing session detail fields', () => {
    const result = normalizeSessionDetails([{}]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe('unknown');
    expect(result[0]?.agentId).toBe('');
    expect(result[0]?.status).toBe('unknown');
    expect(result[0]?.displayName).toBeUndefined();
    expect(result[0]?.messageCount).toBeUndefined();
  });

  it('normalizes session details with lastActivityAt and createdAt', () => {
    const result = normalizeSessionDetails([
      { key: 's1', agentId: 'ceo', status: 'running', lastActivityAt: 1712345678000, createdAt: 1712340000000 },
    ]);

    expect(result[0]?.lastActivityAt).toBe(1712345678000);
    expect(result[0]?.createdAt).toBe(1712340000000);
  });

});
