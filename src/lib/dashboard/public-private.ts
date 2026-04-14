/**
 * Public/private dashboard payload shaping.
 *
 * Public snapshots are explicit summary allowlists to avoid leaking host,
 * filesystem, identity, or raw operator event details.
 */
import type { EventFrame } from '../gateway/types';
import type { DashboardSnapshot } from '../gateway/server-service';

function summarizePublicAgents(snapshot: DashboardSnapshot): DashboardSnapshot['agents'] {
  return snapshot.agents.map((agent) => ({
    id: agent.id,
    ...(agent.name ? { name: agent.name } : {}),
    ...(agent.model ? { model: agent.model } : {}),
  }));
}

function summarizePublicHealth(snapshot: DashboardSnapshot): DashboardSnapshot['health'] {
  if (!snapshot.health) return null;

  const channelKeys = Array.isArray(snapshot.health.channelOrder)
    ? snapshot.health.channelOrder
    : Object.keys(snapshot.health.channels ?? {});

  const channelSummary = channelKeys.map((channel) => {
    const raw = (snapshot.health?.channels as Record<string, unknown> | undefined)?.[channel];
    const record = typeof raw === 'object' && raw ? raw as Record<string, unknown> : {};
    return {
      running: record.running === true,
      probeOk: record.probeOk === true,
    };
  });

  return {
    ok: snapshot.health.ok,
    ts: snapshot.health.ts,
    ...(typeof snapshot.health.durationMs === 'number' ? { durationMs: snapshot.health.durationMs } : {}),
    channelOrder: channelKeys,
    channelLabels: snapshot.health.channelLabels ?? {},
    channels: Object.fromEntries(channelKeys.map((channel, index) => [channel, channelSummary[index] ?? { running: false, probeOk: false }])),
    ...(typeof snapshot.health.heartbeatSeconds === 'number' ? { heartbeatSeconds: snapshot.health.heartbeatSeconds } : {}),
  };
}

function summarizePublicStatus(snapshot: DashboardSnapshot): DashboardSnapshot['status'] {
  if (!snapshot.status) return null;
  return {
    ok: snapshot.status.ok,
    runtimeVersion: snapshot.status.runtimeVersion,
    tasks: snapshot.status.tasks,
    taskAudit: snapshot.status.taskAudit,
    sessions: snapshot.status.sessions
      ? {
        count: snapshot.status.sessions.count,
        byAgent: Array.isArray(snapshot.status.sessions.byAgent)
          ? snapshot.status.sessions.byAgent.map((entry) => ({ agentId: entry.agentId, count: entry.count }))
          : [],
      }
      : undefined,
    channelSummary: snapshot.status.channelSummary,
    ...(snapshot.status.heartbeat
      ? {
        heartbeat: {
          defaultAgentId: snapshot.status.heartbeat.defaultAgentId,
          agents: Array.isArray(snapshot.status.heartbeat.agents)
            ? snapshot.status.heartbeat.agents.map((agent) => ({
              agentId: agent.agentId,
              enabled: agent.enabled,
              every: agent.every,
              everyMs: agent.everyMs,
            }))
            : [],
        },
      }
      : {}),
  };
}

function summarizePublicSkills(snapshot: DashboardSnapshot): DashboardSnapshot['skillsStatus'] {
  if (!snapshot.skillsStatus) return null;
  return {
    workspaceDir: '',
    managedSkillsDir: '',
    skills: snapshot.skillsStatus.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source,
      bundled: skill.bundled,
      ...(skill.emoji ? { emoji: skill.emoji } : {}),
      ...(skill.homepage ? { homepage: skill.homepage } : {}),
      always: skill.always,
      disabled: skill.disabled,
      eligible: skill.eligible,
    })),
  };
}

function summarizePublicCronScheduler(snapshot: DashboardSnapshot): DashboardSnapshot['cronScheduler'] {
  if (!snapshot.cronScheduler) return null;
  return {
    enabled: snapshot.cronScheduler.enabled,
    jobs: snapshot.cronScheduler.jobs,
    nextWakeAtMs: snapshot.cronScheduler.nextWakeAtMs,
  };
}

function summarizePublicChannelStatus(snapshot: DashboardSnapshot): DashboardSnapshot['channelsStatus'] {
  if (!snapshot.channelsStatus) return null;

  const channels = Object.fromEntries(
    Object.entries(snapshot.channelsStatus.channels).map(([channel, details]) => [channel, {
      configured: details.configured,
      running: details.running,
      lastStartAt: details.lastStartAt,
      lastStopAt: details.lastStopAt,
      lastError: null,
    }]),
  );

  const channelAccounts = Object.fromEntries(
    Object.entries(snapshot.channelsStatus.channelAccounts).map(([channel, accounts]) => [channel, accounts.map((account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: account.running,
      connected: account.connected,
      lastStartAt: account.lastStartAt,
      lastStopAt: account.lastStopAt,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      reconnectAttempts: account.reconnectAttempts,
    }))]),
  );

  return {
    ts: snapshot.channelsStatus.ts,
    channelOrder: snapshot.channelsStatus.channelOrder,
    channelLabels: snapshot.channelsStatus.channelLabels,
    channels,
    channelAccounts,
  };
}

/** Serialize a public-safe dashboard snapshot for unauthenticated viewers. */
export function buildPublicSnapshot(snapshot: DashboardSnapshot): Partial<DashboardSnapshot> {
  return {
    connectionState: snapshot.connectionState,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    lastSuccessfulSnapshotAt: snapshot.lastSuccessfulSnapshotAt,
    stale: snapshot.stale,
    reconnectCount: snapshot.reconnectCount,
    errorCount: snapshot.errorCount,
    agents: summarizePublicAgents(snapshot),
    sessions: [],
    cronJobs: snapshot.cronJobs,
    cronRuns: snapshot.cronRuns,
    models: snapshot.models,
    health: summarizePublicHealth(snapshot),
    status: summarizePublicStatus(snapshot),
    presence: [],
    usageCost: snapshot.usageCost,
    usageStatus: snapshot.usageStatus,
    toolsCatalog: snapshot.toolsCatalog,
    skillsStatus: summarizePublicSkills(snapshot),
    channelsStatus: summarizePublicChannelStatus(snapshot),
    cronScheduler: summarizePublicCronScheduler(snapshot),
    memoryStatus: snapshot.memoryStatus,
    configData: null,
    fileStatus: null,
    sessionDetails: null,
    sessionsByAgent: new Map(),
    serverVersion: null,
    availableMethods: [],
    availableEvents: [],
  };
}

/** Serialize a full private dashboard snapshot for authenticated operators. */
export function buildPrivateSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  return snapshot;
}

/** Public dashboards do not expose the raw gateway event feed. */
export function buildPublicEvent(_event: EventFrame): null {
  return null;
}

/** Private dashboards receive the full gateway event frame. */
export function buildPrivateEvent(event: EventFrame): EventFrame {
  return event;
}
