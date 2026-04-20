import { describe, expect, it } from 'vitest';
import { DashboardStore } from './store';

describe('dashboard store', () => {
  it('starts with idle defaults', () => {
    const store = new DashboardStore();
    const state = store.getSnapshot();

    expect(state.connectionState).toBe('idle');
    expect(state.agents).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.stale).toBe(false);
    expect(state.reconnectCount).toBe(0);
    expect(state.errorCount).toBe(0);
  });

  it('updates connection state and status', () => {
    const store = new DashboardStore();
    store.setConnectionState('connected');
    store.setStatus({ ok: true, version: 'test' });
    store.setCronRuns([{ jobId: 'daily', status: 'ok', ts: 1 }]);
    store.setModels([{ id: 'openai/gpt-5.3-codex', provider: 'openai' }]);

    const state = store.getSnapshot();
    expect(state.connectionState).toBe('connected');
    expect(state.status?.ok).toBe(true);
    expect(state.cronRuns).toHaveLength(1);
    expect(state.models).toHaveLength(1);
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const store = new DashboardStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.setConnectionState('connected');
    unsubscribe();
    store.setConnectionState('reconnecting');

    expect(calls).toBe(2);
  });

  it('tracks reconnect and error counters', () => {
    const store = new DashboardStore();
    store.setConnectionState('reconnecting');
    store.setConnectionState('error');
    store.setConnectionState('disconnected');
    const state = store.getSnapshot();

    expect(state.reconnectCount).toBe(1);
    expect(state.errorCount).toBe(2);
  });

  it('supports stale markers and snapshot success updates', () => {
    const store = new DashboardStore();
    store.setStale(true);
    store.markSnapshotSuccess('2026-04-04T00:00:00.000Z');

    const state = store.getSnapshot();
    expect(state.stale).toBe(false);
    expect(state.lastSuccessfulSnapshotAt).toBe('2026-04-04T00:00:00.000Z');
  });

  it('ignores stale no-op updates', () => {
    const store = new DashboardStore();
    const before = store.getSnapshot().lastUpdatedAt;
    store.setStale(false);
    const after = store.getSnapshot().lastUpdatedAt;
    expect(after).toBe(before);
  });

  it('increments reconnect and error counters via applySnapshot', () => {
    const store = new DashboardStore();
    store.applySnapshot({ reconnectCount: 3, errorCount: 2, connectionState: 'reconnecting' });

    const state = store.getSnapshot();
    expect(state.reconnectCount).toBe(3);
    expect(state.errorCount).toBe(2);
    expect(state.connectionState).toBe('reconnecting');
  });

  it('keeps event buffer bounded and newest-first', () => {
    const store = new DashboardStore();
    for (let index = 0; index < 260; index += 1) {
      store.pushEvent({ type: 'event', event: `evt-${index}`, payload: { index } });
    }

    const events = store.getSnapshot().events;
    expect(events).toHaveLength(200);
    expect(events[0]?.event).toBe('evt-259');
    expect(events[199]?.event).toBe('evt-60');
  });

  it('pushes batched events in single update', () => {
    const store = new DashboardStore();
    store.pushEvents([
      { type: 'event', event: 'heartbeat', payload: { n: 1 } },
      { type: 'event', event: 'cron', payload: { n: 2 } },
    ]);

    const events = store.getSnapshot().events;
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe('heartbeat');
    expect(events[1]?.event).toBe('cron');
  });

  it('sets and retrieves health data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().health).toBeNull();

    store.setHealth({
      ok: true,
      ts: 1712345678000,
      durationMs: 300,
      channels: { discord: { configured: true, running: false } },
      channelOrder: ['discord'],
      channelLabels: { discord: 'Discord' },
    });

    const state = store.getSnapshot();
    expect(state.health).not.toBeNull();
    expect(state.health?.ok).toBe(true);
    expect(state.health?.durationMs).toBe(300);
    expect(state.health?.channelOrder).toEqual(['discord']);
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('sets and retrieves presence data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().presence).toEqual([]);

    store.setPresence([
      { ts: 1712345678000, host: 'workstation-a', mode: 'webchat', platform: 'linux', version: '0.16.0' },
      { ts: 1712345679000, host: 'phone-b', platform: 'ios' },
    ]);

    const state = store.getSnapshot();
    expect(state.presence).toHaveLength(2);
    expect(state.presence[0]?.host).toBe('workstation-a');
    expect(state.presence[1]?.platform).toBe('ios');
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('notifies subscribers when health changes', () => {
    const store = new DashboardStore();
    let lastState = store.getSnapshot();
    store.subscribe((state) => { lastState = state; });

    store.setHealth({ ok: true, ts: 0 });
    expect(lastState.health?.ok).toBe(true);
  });

  it('notifies subscribers when presence changes', () => {
    const store = new DashboardStore();
    let lastState = store.getSnapshot();
    store.subscribe((state) => { lastState = state; });

    store.setPresence([{ ts: 1000, host: 'test' }]);
    expect(lastState.presence).toHaveLength(1);
    expect(lastState.presence[0]?.host).toBe('test');
  });

  // --- Coverage: setAgents, setSessions, setCronJobs direct calls ---

  it('sets and retrieves agents directly', () => {
    const store = new DashboardStore();
    store.setAgents([{ id: 'ceo' }, { id: 'ops' }]);
    expect(store.getSnapshot().agents).toHaveLength(2);
    expect(store.getSnapshot().agents[0]?.id).toBe('ceo');
  });

  it('sets and retrieves sessions directly', () => {
    const store = new DashboardStore();
    store.setSessions([{ key: 'agent:ceo:main' }]);
    expect(store.getSnapshot().sessions).toHaveLength(1);
    expect(store.getSnapshot().sessions[0]?.key).toBe('agent:ceo:main');
  });

  it('sets and retrieves cron jobs directly', () => {
    const store = new DashboardStore();
    store.setCronJobs([{ id: 'j1', name: 'daily' }]);
    expect(store.getSnapshot().cronJobs).toHaveLength(1);
    expect(store.getSnapshot().cronJobs[0]?.name).toBe('daily');
  });

  // --- Coverage: pushEvents empty array guard ---

  it('skips update when pushing empty events array', () => {
    const store = new DashboardStore();
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    // subscribe fires once immediately
    expect(calls).toBe(1);

    store.pushEvents([]);
    // should NOT fire again — empty array is a no-op
    expect(calls).toBe(1);
    expect(store.getSnapshot().events).toHaveLength(0);
  });

  // --- Extended data setters (mega-batch) ---

  it('sets and retrieves usage cost data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().usageCost).toBeNull();

    store.setUsageCost({
      updatedAt: 1712345678000,
      days: 31,
      daily: [{ date: '2026-04-01', input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 1200, totalCost: 0 }],
      totals: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 1200, totalCost: 0 },
    });

    const state = store.getSnapshot();
    expect(state.usageCost).not.toBeNull();
    expect(state.usageCost?.days).toBe(31);
    expect(state.usageCost?.daily).toHaveLength(1);
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('sets and retrieves tools catalog data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().toolsCatalog).toBeNull();

    store.setToolsCatalog({
      agentId: 'ceo',
      profiles: [{ id: 'default', label: 'Default' }],
      groups: [{ id: 'fs', label: 'Files', source: 'core', tools: [{ id: 'read', label: 'Read', description: 'Read a file', source: 'core' }] }],
    });

    const state = store.getSnapshot();
    expect(state.toolsCatalog?.agentId).toBe('ceo');
    expect(state.toolsCatalog?.groups).toHaveLength(1);
    expect(state.toolsCatalog?.groups[0]?.tools).toHaveLength(1);
  });

  it('sets and retrieves skills status data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().skillsStatus).toBeNull();

    store.setSkillsStatus({
      workspaceDir: '/home/user',
      managedSkillsDir: '/home/user/.openclaw/skills',
      skills: [{ name: 'git', description: 'Git ops', source: 'bundled', bundled: true, always: true, disabled: false, eligible: true, missing: { bins: [], env: [] } }],
    });

    const state = store.getSnapshot();
    expect(state.skillsStatus?.skills).toHaveLength(1);
    expect(state.skillsStatus?.skills[0]?.name).toBe('git');
  });

  it('sets and retrieves channels status data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().channelsStatus).toBeNull();

    store.setChannelsStatus({
      ts: 1712345678000,
      channelOrder: ['discord'],
      channelLabels: { discord: 'Discord' },
      channels: { discord: { configured: true, running: true, lastStartAt: null, lastStopAt: null, lastError: null } },
      channelAccounts: {},
    });

    const state = store.getSnapshot();
    expect(state.channelsStatus?.channelOrder).toEqual(['discord']);
    expect(state.channelsStatus?.channels.discord?.running).toBe(true);
  });

  it('sets and retrieves cron scheduler data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().cronScheduler).toBeNull();

    store.setCronScheduler({ enabled: true, jobs: 7, nextWakeAtMs: 1712346000000 });

    const state = store.getSnapshot();
    expect(state.cronScheduler?.enabled).toBe(true);
    expect(state.cronScheduler?.jobs).toBe(7);
    expect(state.cronScheduler?.nextWakeAtMs).toBe(1712346000000);
  });

  it('sets and retrieves memory status data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().memoryStatus).toBeNull();

    store.setMemoryStatus({
      agentId: 'ceo',
      provider: 'ollama-cloud',
      embedding: { ok: true },
      dreaming: {
        enabled: true,
        phases: { light: { enabled: true, cron: '*/5 * * * *' } },
        shortTermCount: 42,
        recallSignalCount: 15,
        totalSignalCount: 200,
        promotedTotal: 50,
        promotedToday: 3,
      },
    });

    const state = store.getSnapshot();
    expect(state.memoryStatus?.agentId).toBe('ceo');
    expect(state.memoryStatus?.embedding.ok).toBe(true);
    expect(state.memoryStatus?.dreaming.enabled).toBe(true);
    expect(state.memoryStatus?.dreaming.promotedToday).toBe(3);
  });

  it('notifies subscribers when extended data changes', () => {
    const store = new DashboardStore();
    let lastState = store.getSnapshot();
    store.subscribe((state) => { lastState = state; });

    store.setUsageCost({ updatedAt: 0, days: 0, daily: [], totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0 } });
    expect(lastState.usageCost).not.toBeNull();

    store.setCronScheduler({ enabled: false, jobs: 0, nextWakeAtMs: null });
    expect(lastState.cronScheduler).not.toBeNull();
  });

  // --- Coverage: Batch 4 setters ---

  it('sets and retrieves config data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().configData).toBeNull();

    store.setConfigData({ port: 18789, debug: false });

    const state = store.getSnapshot();
    expect(state.configData).not.toBeNull();
    expect(state.configData?.port).toBe(18789);
    expect(state.configData?.debug).toBe(false);
  });

  it('applies snapshot in a single update and clears nullable sections', () => {
    const store = new DashboardStore();
    store.setConfigData({ mode: 'full' });
    store.setFileStatus([{ path: 'src/main.ts', status: 'modified' }]);
    store.setSessionDetails([{ key: 's1', status: 'running' }]);

    let calls = 0;
    store.subscribe(() => { calls += 1; });
    expect(calls).toBe(1);

    store.applySnapshot({
      connectionState: 'connected',
      agents: [{ id: 'ceo' }],
      sessions: [{ key: 'agent:ceo:main' }],
      configData: null,
      fileStatus: null,
      sessionDetails: null,
    });

    const state = store.getSnapshot();
    expect(calls).toBe(2);
    expect(state.connectionState).toBe('connected');
    expect(state.agents).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
    expect(state.configData).toBeNull();
    expect(state.fileStatus).toBeNull();
    expect(state.sessionDetails).toBeNull();
  });

  // --- Coverage: setFileStatus ---

  it('sets and retrieves file status data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().fileStatus).toBeNull();

    store.setFileStatus([
      { path: 'src/index.ts', status: 'modified', language: 'typescript' },
      { path: 'README.md', status: 'added' },
    ]);

    const state = store.getSnapshot();
    expect(state.fileStatus).toHaveLength(2);
    expect(state.fileStatus?.[0]?.path).toBe('src/index.ts');
    expect(state.fileStatus?.[0]?.status).toBe('modified');
    expect(state.fileStatus?.[1]?.path).toBe('README.md');
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('notifies subscribers when file status changes', () => {
    const store = new DashboardStore();
    let lastState = store.getSnapshot();
    store.subscribe((state) => { lastState = state; });

    store.setFileStatus([{ path: 'test.ts', status: 'deleted' }]);
    expect(lastState.fileStatus).toHaveLength(1);
    expect(lastState.fileStatus?.[0]?.status).toBe('deleted');
  });

  // --- Coverage: Batch 6 setters ---

  it('sets and retrieves session details data', () => {
    const store = new DashboardStore();
    expect(store.getSnapshot().sessionDetails).toBeNull();

    store.setSessionDetails([
      { key: 'agent:ceo:main', agentId: 'ceo', status: 'running', displayName: 'CEO Main', messageCount: 42 },
      { key: 'agent:ops:deploy', agentId: 'ops', status: 'idle' },
    ]);

    const state = store.getSnapshot();
    expect(state.sessionDetails).toHaveLength(2);
    expect(state.sessionDetails?.[0]?.key).toBe('agent:ceo:main');
    expect(state.sessionDetails?.[0]?.agentId).toBe('ceo');
    expect(state.sessionDetails?.[0]?.status).toBe('running');
    expect(state.sessionDetails?.[0]?.messageCount).toBe(42);
    expect(state.sessionDetails?.[1]?.status).toBe('idle');
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('notifies subscribers when session details change', () => {
    const store = new DashboardStore();
    let lastState = store.getSnapshot();
    store.subscribe((state) => { lastState = state; });

    store.setSessionDetails([{ key: 's1', agentId: 'ceo', status: 'running' }]);
    expect(lastState.sessionDetails).toHaveLength(1);
    expect(lastState.sessionDetails?.[0]?.key).toBe('s1');
  });

  // --- Ring buffer overflow with pushEvent ---

  it('ring buffer correctly handles overflow', () => {
    const store = new DashboardStore(5);
    for (let i = 0; i < 8; i += 1) {
      store.pushEvent({ type: 'event', event: `evt-${i}`, payload: {} });
    }

    const events = store.getSnapshot().events;
    expect(events).toHaveLength(5);
    expect(events[0]?.event).toBe('evt-7');
    expect(events[4]?.event).toBe('evt-3');
  });

  // --- maxDailyEntries cap on usageCost.daily ---

  it('caps usageCost.daily to maxDailyEntries', () => {
    const store = new DashboardStore();
    const daily = Array.from({ length: 400 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      totalCost: 0.01,
    }));

    store.setUsageCost({
      updatedAt: Date.now(),
      days: 400,
      daily,
      totals: { input: 40000, output: 20000, cacheRead: 0, cacheWrite: 0, totalTokens: 60000, totalCost: 4 },
    });

    expect(store.getSnapshot().usageCost?.daily).toHaveLength(365);
  });

  it('caps usageCost.daily in applySnapshot', () => {
    const store = new DashboardStore();
    const daily = Array.from({ length: 400 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      totalCost: 0.01,
    }));

    store.applySnapshot({
      usageCost: {
        updatedAt: Date.now(),
        days: 400,
        daily,
        totals: { input: 40000, output: 20000, cacheRead: 0, cacheWrite: 0, totalTokens: 60000, totalCost: 4 },
      },
    });

    expect(store.getSnapshot().usageCost?.daily).toHaveLength(365);
  });

  it('does not cap short usageCost.daily', () => {
    const store = new DashboardStore();
    const daily = [{ date: '2026-04-01', input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150, totalCost: 0 }];

    store.setUsageCost({
      updatedAt: Date.now(),
      days: 1,
      daily,
      totals: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150, totalCost: 0 },
    });

    expect(store.getSnapshot().usageCost?.daily).toHaveLength(1);
  });

});
