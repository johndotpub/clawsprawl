import {
  asString,
  extractChannelHealth,
  extractCronRunError,
  formatTokenCount,
  formatEventPreview,
  latestCronRunsByJob,
  summarizeProviderHealth,
} from '../adapters';
import type { DashboardState } from '../store';
import {
  badge,
  channelErrorDetail,
  emptyRow,
  escapeHtml,
  eventBucket,
  extractTimestamp,
  filterEvents,
  formatAge,
  formatAgentModel,
  formatContextWindow,
  label,
  muted,
  row,
  rowWithDetail,
  SESSION_DISPLAY_LIMIT,
  tag,
  truncate,
} from './shared';

export function renderEventRows(state: DashboardState, enabledFilters: Set<string>): string {
  const rows = state.events
    .filter((event) => {
      const eventName = asString(event.event, 'other');
      if (!enabledFilters.has(eventBucket(eventName))) return false;
      return true;
    })
    .slice(0, 20)
    .map((event) => {
      const eventPayload = (event.payload ?? {}) as Record<string, unknown>;
      const timestamp = extractTimestamp(eventPayload, event.seq);
      const eventName = asString(event.event, 'event');
      const preview = formatEventPreview(event);
      return rowWithDetail(
        [tag(timestamp), badge('muted', eventName)],
        `<p class="mt-1 break-words">${escapeHtml(preview)}</p>`,
      );
    });
  return rows.length > 0 ? rows.join('') : emptyRow('No live events yet.');
}

export function renderAgentRows(state: DashboardState, sessionCounts: Map<string, number>): string {
  const rows = state.agents.map((agent) => {
    const agentId = asString(agent.id, 'unknown');
    const count = sessionCounts.get(agentId) ?? 0;
    const model = formatAgentModel(agent.model);
    return row([label(agentId), muted(`sessions:${count}`), tag(model)], 'stack');
  });
  return rows.length > 0 ? rows.join('') : emptyRow('No agents loaded.');
}

export function renderCronRows(state: DashboardState): string {
  const runByJob = latestCronRunsByJob(state.cronRuns);
  const rows = state.cronJobs.map((job) => {
    const name = asString(job.name, 'cron-job');
    const jobId = asString(job.id, name);
    const schedule = typeof job.schedule === 'object' && job.schedule !== null
      ? asString((job.schedule as Record<string, unknown>).expr, 'n/a')
      : asString(job.schedule, 'n/a');
    const enabled = job.enabled !== false;
    const run_ = runByJob.get(jobId) ?? runByJob.get(name);
    const runStatus = run_ ? asString(run_.status, enabled ? 'pending' : 'disabled') : (enabled ? 'pending' : 'disabled');
    const errorDetail = extractCronRunError(run_);
    const tone: 'ok' | 'error' | 'warn' = runStatus.toLowerCase().includes('error')
      ? 'error'
      : runStatus === 'ok' ? 'ok' : 'warn';
    const detail = errorDetail
      ? `<p class="mt-1 text-terminal-error">error: ${escapeHtml(errorDetail)}</p>`
      : '<p class="mt-1 text-terminal-muted">error: none</p>';
    return rowWithDetail([label(name), muted(schedule), badge(tone, runStatus)], detail);
  });
  return rows.length > 0 ? rows.join('') : emptyRow('No cron data loaded.');
}

export function renderProviderRows(state: DashboardState): string {
  const summary = summarizeProviderHealth(state.models);
  const rows = summary.map((entry) => {
    const tone: 'ok' | 'warn' = entry.status === 'healthy' ? 'ok' : 'warn';
    return row([label(entry.provider), badge(tone, entry.status), tag(`models:${entry.modelCount}`)]);
  });
  return rows.length > 0 ? rows.join('') : emptyRow('No model provider data loaded.');
}

export function renderSessionRows(state: DashboardState): string {
  const sessions = state.sessions.slice(0, SESSION_DISPLAY_LIMIT);
  const rows = sessions.map((session) => {
    const key = asString(session.key, 'unknown');
    const displayName = asString(session.displayName, key);
    const kind = asString(session.kind, '');
    const channel = asString(session.channel, '');
    const agentId = asString(session.agentId, '');
    const age = typeof session.updatedAt === 'number' ? formatAge(session.updatedAt) : '';
    const status = asString((session as Record<string, unknown>).status, '');
    const parts: string[] = [label(displayName)];
    if (agentId) parts.push(tag(agentId));
    if (kind) parts.push(muted(kind));
    if (channel) parts.push(muted(channel));
    if (status === 'running') parts.push(badge('ok', 'running'));
    else if (status) parts.push(badge('muted', status));
    if (age) parts.push(muted(age));
    return row(parts, 'stack');
  });
  if (rows.length === 0) return emptyRow('No sessions loaded.');
  const overflow = state.sessions.length > SESSION_DISPLAY_LIMIT
    ? emptyRow(`… and ${state.sessions.length - SESSION_DISPLAY_LIMIT} more`)
    : '';
  return rows.join('') + overflow;
}

export function renderModelRows(state: DashboardState): string {
  const rows = state.models.map((model) => {
    const id = asString(model.id, 'unknown');
    const name = asString(model.name, id);
    const provider = asString(model.provider, '');
    const ctx = formatContextWindow(model.contextWindow);
    const inputTypes = Array.isArray(model.input) ? model.input.join(', ') : '';
    const parts: string[] = [label(name)];
    if (provider) parts.push(tag(provider));
    parts.push(muted(`ctx:${ctx}`));
    if (inputTypes) parts.push(muted(inputTypes));
    return row(parts, 'stack');
  });
  return rows.length > 0 ? rows.join('') : emptyRow('No models loaded.');
}

export function renderHealthRows(state: DashboardState): string {
  if (!state.health) return emptyRow('No health data loaded.');

  const parts: string[] = [];
  const overallTone: 'ok' | 'error' = state.health.ok ? 'ok' : 'error';
  const overallText = state.health.ok ? 'healthy' : 'unhealthy';
  const durationSuffix = typeof state.health.durationMs === 'number' ? ` (${state.health.durationMs}ms)` : '';
  parts.push(row([label('Overall'), badge(overallTone, overallText), muted(durationSuffix)]));

  for (const ch of extractChannelHealth(state.health)) {
    const probeTone: 'ok' | 'error' = ch.probeOk ? 'ok' : 'error';
    const probeLabel = ch.probeOk ? 'probe ok' : 'probe fail';
    const probeMs = ch.probeMs !== null ? ` ${ch.probeMs}ms` : '';
    const runningCls = ch.running ? 'text-terminal-green' : 'text-terminal-muted';
    const runningText = ch.running ? 'running' : 'stopped';
    const children = [
      label(ch.label),
      badge(probeTone, `${probeLabel}${probeMs}`),
      `<span class="${runningCls}">${escapeHtml(runningText)}</span>`,
    ];
    if (ch.botUsername) children.push(tag(`bot:${ch.botUsername}`));
    const errorLine = channelErrorDetail(ch.lastError);
    parts.push(errorLine ? rowWithDetail(children, errorLine) : row(children));
  }

  return parts.length > 0 ? parts.join('') : emptyRow('No health data loaded.');
}

export function renderStatusRows(state: DashboardState): string {
  if (!state.status) return emptyRow('No status data loaded.');

  const parts: string[] = [];
  const s = state.status;

  if (s.runtimeVersion) {
    parts.push(row([muted('Runtime'), tag(s.runtimeVersion)]));
  }

  if (s.tasks) {
    const t = s.tasks;
    const failCls = t.failures > 0 ? 'text-terminal-error' : 'text-terminal-muted';
    parts.push(row([
      label('Tasks'),
      muted(`total:${t.total}`),
      '<span class="text-terminal-green">' + escapeHtml(`active:${t.active}`) + '</span>',
      muted(`done:${t.terminal}`),
      `<span class="${failCls}">${escapeHtml(`fail:${t.failures}`)}</span>`,
    ]));

    const runtimeParts = Object.entries(t.byRuntime ?? {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    if (runtimeParts) {
      parts.push(row([muted('By runtime'), label(runtimeParts)]));
    }
  }

  if (s.taskAudit && (s.taskAudit.warnings > 0 || s.taskAudit.errors > 0)) {
    const auditCls = s.taskAudit.errors > 0 ? 'text-terminal-error' : 'text-terminal-amber';
    parts.push(row([
      label('Audit'),
      `<span class="${auditCls}">${escapeHtml(`warnings:${s.taskAudit.warnings} errors:${s.taskAudit.errors}`)}</span>`,
    ]));
  }

  if (s.sessions?.byAgent && s.sessions.byAgent.length > 0) {
    const agentParts = s.sessions.byAgent.map((a) => `${a.agentId}:${a.count}`).join(' ');
    parts.push(row([label('Sessions'), muted(`total:${s.sessions.count}`), tag(agentParts)]));
  }

  if (s.channelSummary && s.channelSummary.length > 0) {
    parts.push(row([muted('Channels'), label(s.channelSummary.join(', '))]));
  }

  return parts.length > 0 ? parts.join('') : emptyRow('No status data loaded.');
}

export function renderPresenceRows(state: DashboardState): string {
  const rows = state.presence.map((entry) => {
    const host = asString(entry.host, '');
    const mode = asString(entry.mode, '');
    const platform = asString(entry.platform, '');
    const version = asString(entry.version, '');
    const reason = asString(entry.reason, '');
    const age = entry.ts > 0 ? formatAge(entry.ts) : '';
    const parts: string[] = [];
    parts.push(host ? label(host) : muted('unknown'));
    if (mode) parts.push(tag(mode));
    if (platform) parts.push(muted(platform));
    if (version) parts.push(muted(`v${version}`));
    if (reason) parts.push(muted(reason));
    if (age) parts.push(muted(age));
    return row(parts);
  });
  return rows.length > 0 ? rows.join('') : emptyRow('No connected clients.');
}

export function renderUsageCostRows(state: DashboardState): string {
  const parts: string[] = [];

  if (state.usageStatus?.providers.length) {
    for (const provider of state.usageStatus.providers) {
      const providerLabel = label(provider.provider);
      const tone: 'ok' | 'warn' | 'error' = provider.status === 'ok'
        ? 'ok'
        : provider.status === 'warn'
          ? 'warn'
          : 'error';
      const chips: string[] = [providerLabel, badge(tone, provider.status)];
      if (provider.limit !== null && provider.limit > 0) {
        chips.push(muted(`limit:${formatTokenCount(provider.limit)}`));
      }
      if (provider.used !== null && provider.used >= 0) {
        chips.push(tag(`used:${formatTokenCount(provider.used)}`));
      }
      if (provider.remaining !== null) {
        chips.push(muted(`remaining:${formatTokenCount(provider.remaining)}`));
      }
      if (provider.resetAt) {
        chips.push(muted(`reset:${formatAge(provider.resetAt)}`));
      }
      parts.push(row(chips));
    }
  }

  if (!state.usageCost) {
    return parts.length > 0 ? parts.join('') : emptyRow('No usage data loaded.');
  }

  const t = state.usageCost.totals;

  parts.push(row([
    label('Total'),
    tag(`in:${formatTokenCount(t.input)}`),
    tag(`out:${formatTokenCount(t.output)}`),
    muted(`tokens:${formatTokenCount(t.totalTokens)}`),
    ...(t.totalCost > 0 ? [muted(`cost:$${t.totalCost.toFixed(2)}`)] : []),
  ]));

  const recent = state.usageCost.daily.slice(-7).reverse();
  for (const day of recent) {
    if (day.totalTokens === 0) continue;
    parts.push(row([
      muted(day.date),
      tag(`in:${formatTokenCount(day.input)}`),
      tag(`out:${formatTokenCount(day.output)}`),
      muted(`${formatTokenCount(day.totalTokens)} tokens`),
    ]));
  }

  return parts.length > 0 ? parts.join('') : emptyRow('No usage data loaded.');
}

export function renderToolCatalogRows(state: DashboardState): string {
  if (!state.toolsCatalog) return emptyRow('No tool catalog loaded.');

  const rows = state.toolsCatalog.groups.map((group) => {
    const toolNames = group.tools.map((t) => t.label || t.id).join(', ');
    return rowWithDetail(
      [label(group.label), tag(`${group.tools.length} tools`), muted(group.source)],
      `<p class="mt-1 text-terminal-muted break-words">${escapeHtml(toolNames)}</p>`,
    );
  });

  return rows.length > 0 ? rows.join('') : emptyRow('No tools available.');
}

export function renderSkillsRows(state: DashboardState): string {
  if (!state.skillsStatus) return emptyRow('No skills data loaded.');

  const rows = state.skillsStatus.skills
    .filter((s) => s.eligible || s.always)
    .map((skill) => {
      const prefix = skill.emoji ? `${skill.emoji} ` : '';
      const eligibleBadge = skill.eligible ? badge('ok', 'eligible') : badge('muted', 'unavailable');
      const parts = [label(`${prefix}${skill.name}`), eligibleBadge, muted(skill.source)];
      if (skill.disabled) parts.push(badge('warn', 'disabled'));
      if (skill.always) parts.push(badge('ok', 'always'));
      return row(parts, 'stack');
    });

  const totalEligible = state.skillsStatus.skills.filter((s) => s.eligible).length;
  const totalSkills = state.skillsStatus.skills.length;
  const summary = row([muted('Skills'), tag(`${totalEligible}/${totalSkills} eligible`)]);

  return summary + (rows.length > 0 ? rows.join('') : '');
}

export function renderChannelsStatusRows(state: DashboardState): string {
  if (!state.channelsStatus) return emptyRow('No channel status loaded.');

  const parts: string[] = [];

  for (const channel of state.channelsStatus.channelOrder) {
    const label_ = state.channelsStatus.channelLabels[channel] ?? channel;
    const ch = state.channelsStatus.channels[channel];
    if (!ch) continue;

    const statusBadge = ch.running ? badge('ok', 'running') : badge('error', 'stopped');
    const accounts = state.channelsStatus.channelAccounts[channel] ?? [];

    if (accounts.length === 0) {
      parts.push(row([label(label_), statusBadge, muted('no accounts')]));
      continue;
    }

    for (const acc of accounts) {
      const connBadge = acc.connected ? badge('ok', 'connected') : badge('error', 'disconnected');
      const botName = acc.bot ? tag(`bot:${acc.bot.username}`) : '';
      const lastIn = acc.lastInboundAt ? muted(`in:${formatAge(acc.lastInboundAt)}`) : '';
      const lastOut = acc.lastOutboundAt ? muted(`out:${formatAge(acc.lastOutboundAt)}`) : '';
      const retries = acc.reconnectAttempts > 0 ? muted(`retries:${acc.reconnectAttempts}`) : '';
      const children = [label(label_), connBadge, botName, lastIn, lastOut, retries].filter(Boolean);
      const errorLine = channelErrorDetail(acc.lastError);
      parts.push(errorLine ? rowWithDetail(children, errorLine) : row(children));
    }
  }

  return parts.length > 0 ? parts.join('') : emptyRow('No channel status available.');
}

export function renderCronSchedulerRows(state: DashboardState): string {
  if (!state.cronScheduler) return emptyRow('No scheduler status loaded.');

  const cs = state.cronScheduler;
  const enabledBadge = cs.enabled ? badge('ok', 'enabled') : badge('error', 'disabled');
  const nextWake = cs.nextWakeAtMs ? muted(`next:${formatAge(cs.nextWakeAtMs)}`) : muted('no next wake');

  return row([label('Scheduler'), enabledBadge, tag(`${cs.jobs} jobs`), nextWake]);
}

export function renderMemoryStatusRows(state: DashboardState): string {
  if (!state.memoryStatus) return emptyRow('No memory status loaded.');

  const parts: string[] = [];
  const ms = state.memoryStatus;

  const embeddingBadge = ms.embedding.ok ? badge('ok', 'ok') : badge('error', 'fail');
  parts.push(row([label('Embedding'), embeddingBadge, muted(`agent:${ms.agentId}`), muted(`provider:${ms.provider}`)]));

  const dreamBadge = ms.dreaming.enabled ? badge('ok', 'enabled') : badge('muted', 'disabled');
  parts.push(row([
    label('Dreaming'),
    dreamBadge,
    muted(`signals:${ms.dreaming.totalSignalCount}`),
    muted(`promoted:${ms.dreaming.promotedTotal}`),
    muted(`today:${ms.dreaming.promotedToday}`),
  ]));

  for (const [name, phase] of Object.entries(ms.dreaming.phases)) {
    const phaseBadge = phase.enabled ? badge('ok', 'on') : badge('muted', 'off');
    parts.push(row([muted(name), phaseBadge, muted(phase.cron)]));
  }

  return parts.join('');
}

export function renderConfigRows(state: DashboardState): string {
  if (!state.configData) return emptyRow('No config data loaded.');

  const entries = Object.entries(state.configData);
  if (entries.length === 0) return emptyRow('Config is empty.');

  const rows = entries.map(([key, value]) => {
    let display: string;
    if (typeof value === 'object' && value !== null) {
      const json = JSON.stringify(value);
      display = truncate(json, 100);
    } else {
      display = String(value);
    }
    return row([tag(key), muted(display)], 'stack');
  });
  return rows.join('');
}

export function renderPermissionActivityRows(state: DashboardState): string {
  const events = filterEvents(state.events, (name) =>
    name.startsWith('exec.approval.') || name.startsWith('plugin.approval.'));

  if (events.length === 0) return emptyRow('No permission events yet.');

  return events.map((event) => {
    const eventName = asString(event.event, 'approval');
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const tool = asString(payload.tool, asString(payload.toolName, ''));
    const action = asString(payload.action, '');
    const result = asString(payload.result, asString(payload.response, ''));
    const timestamp = extractTimestamp(payload, event.seq);

    const isRequested = eventName.endsWith('.requested');
    const tone: 'ok' | 'warn' | 'muted' = isRequested ? 'warn' : (result === 'granted' ? 'ok' : 'muted');
    const statusText = isRequested ? 'requested' : (result || 'resolved');

    const parts: string[] = [tag(timestamp), badge(tone, statusText)];
    if (tool) parts.push(label(tool));
    if (action) parts.push(muted(action));
    return row(parts);
  }).join('');
}

export function renderToolExecutionRows(state: DashboardState): string {
  const events = filterEvents(state.events, (name) => name === 'session.tool');

  if (events.length === 0) return emptyRow('No tool executions yet.');

  return events.map((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const tool = asString(payload.tool, asString(payload.toolName, asString(payload.name, '')));
    const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : null;
    const success = payload.success === true || payload.ok === true;
    const error = asString(payload.error, '');
    const status = asString(payload.status, '');
    const timestamp = extractTimestamp(payload, event.seq);

    const isRunning = status === 'running' || status === 'pending';
    const tone: 'ok' | 'error' | 'warn' = isRunning ? 'warn' : (success && !error ? 'ok' : 'error');
    const statusText = isRunning ? 'running' : (success && !error ? 'ok' : 'fail');

    const parts: string[] = [tag(timestamp), badge(tone, statusText)];
    if (tool) parts.push(label(tool));
    if (durationMs !== null) parts.push(muted(`${durationMs}ms`));

    if (error) {
      return rowWithDetail(parts, `<p class="mt-1 text-terminal-error">${escapeHtml(truncate(error, 80))}</p>`);
    }
    return row(parts);
  }).join('');
}

export function renderFileTrackingRows(state: DashboardState): string {
  const parts: string[] = [];

  if (state.fileStatus && state.fileStatus.length > 0) {
    parts.push(row([muted('📁 Modified files'), tag(`${state.fileStatus.length} files`)]));
    for (const file of state.fileStatus.slice(0, 20)) {
      const statusTone: 'ok' | 'warn' | 'error' = file.status === 'modified' ? 'warn'
        : file.status === 'added' ? 'ok'
          : file.status === 'deleted' ? 'error' : 'muted';
      const fileParts: string[] = [label(file.path), badge(statusTone, file.status)];
      if (file.language) fileParts.push(muted(file.language));
      if (typeof file.modifiedAt === 'number') fileParts.push(muted(formatAge(file.modifiedAt)));
      parts.push(row(fileParts, 'stack'));
    }
    if (state.fileStatus.length > 20) {
      parts.push(emptyRow(`… and ${state.fileStatus.length - 20} more files`));
    }
  }

  const fileEvents = filterEvents(state.events, (name) => name.startsWith('file.'));

  if (fileEvents.length > 0) {
    parts.push(row([muted('📝 Recent file events'), tag(`${fileEvents.length} events`)]));
    for (const event of fileEvents) {
      const eventName = asString(event.event, 'file');
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const filePath = asString(payload.path, asString(payload.file, ''));
      const action = eventName.replace('file.', '');
      const timestamp = extractTimestamp(payload, event.seq);

      const eventParts: string[] = [tag(timestamp), badge('muted', action)];
      if (filePath) eventParts.push(label(filePath));
      parts.push(row(eventParts, 'stack'));
    }
  }

  return parts.length > 0 ? parts.join('') : emptyRow('No file changes tracked yet.');
}

export function renderSessionDetailRows(state: DashboardState): string {
  if (!state.sessionDetails) return emptyRow('No session detail data loaded.');
  if (state.sessionDetails.length === 0) return emptyRow('No active sessions.');

  const rows = state.sessionDetails.slice(0, SESSION_DISPLAY_LIMIT).map((session) => {
    const displayName = asString(session.displayName, session.key);
    const agentId = session.agentId;
    const status = session.status;
    const kind = asString(session.kind, '');
    const channel = asString(session.channel, '');

    const statusTone: 'ok' | 'error' | 'warn' | 'muted' =
      status === 'running' ? 'ok'
        : status === 'error' ? 'error'
          : status === 'idle' ? 'warn' : 'muted';

    const parts: string[] = [label(displayName)];
    if (agentId) parts.push(tag(agentId));
    parts.push(badge(statusTone, status));
    if (kind) parts.push(muted(kind));
    if (channel) parts.push(muted(channel));
    if (typeof session.messageCount === 'number') parts.push(muted(`msgs:${session.messageCount}`));
    if (typeof session.tokenCount === 'number') parts.push(muted(`tokens:${session.tokenCount}`));
    if (typeof session.lastActivityAt === 'number') parts.push(muted(formatAge(session.lastActivityAt)));
    return row(parts, 'stack');
  });

  const overflow = state.sessionDetails.length > SESSION_DISPLAY_LIMIT
    ? emptyRow(`… and ${state.sessionDetails.length - SESSION_DISPLAY_LIMIT} more`)
    : '';
  return rows.join('') + overflow;
}
