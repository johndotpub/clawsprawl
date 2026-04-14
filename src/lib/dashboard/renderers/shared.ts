import { asString, formatTokenCount } from '../adapters';
import type { DashboardState } from '../store';
import type { ConnectionState } from '../../gateway/types';

const ROW = 'rounded border border-terminal-border bg-terminal-surface-2 px-3 py-2';
const FLEX = 'flex flex-wrap items-center gap-2';
const FLEX_STACK = 'flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center';

/** Maximum activity rows rendered per activity panel. */
export const ACTIVITY_DISPLAY_LIMIT = 30;

/** Maximum sessions rendered before showing an overflow row. */
export const SESSION_DISPLAY_LIMIT = 50;

/** Escape untrusted values for safe HTML injection. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function span(cls: string, text: string): string {
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

export function label(text: string): string { return span('text-terminal-text break-words', text); }
export function tag(text: string): string { return span('text-terminal-cyan', text); }
export function muted(text: string): string { return span('text-terminal-muted', text); }

/** Render a semantic status badge chip. */
export function badge(status: 'ok' | 'error' | 'warn' | 'muted', text: string): string {
  return span(`status-badge status-${status}`, text);
}

/** Wrap row children in the canonical dashboard row container. */
export function row(children: string[], layout: 'flex' | 'stack' = 'flex'): string {
  const cls = layout === 'stack' ? FLEX_STACK : FLEX;
  return `<li class="${ROW}"><div class="${cls}">${children.join('')}</div></li>`;
}

/** Render a row with a secondary detail line beneath the chip row. */
export function rowWithDetail(children: string[], detail: string): string {
  return `<li class="${ROW}"><div class="${FLEX}">${children.join('')}</div>${detail}</li>`;
}

/** Render a muted empty-state row for panels with no data. */
export function emptyRow(message: string): string {
  return `<li class="text-terminal-muted">${escapeHtml(message)}</li>`;
}

/** Extract a display timestamp from event payload/sequence. */
export function extractTimestamp(payload: Record<string, unknown>, seq: unknown): string {
  const tsValue = payload.ts ?? seq;
  return typeof tsValue === 'number' ? new Date(tsValue).toLocaleTimeString() : 'now';
}

/** Filter and slice event rows for activity-derived panels. */
export function filterEvents(
  events: DashboardState['events'],
  predicate: (name: string) => boolean,
  limit = ACTIVITY_DISPLAY_LIMIT,
): DashboardState['events'] {
  return events.filter((e) => predicate(asString(e.event, ''))).slice(0, limit);
}

/** Truncate long strings with an ellipsis suffix. */
export function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen) + '…' : value;
}

/** Format epoch-ms to a compact relative age string. */
export function formatAge(epochMs: number): string {
  const deltaMs = Date.now() - epochMs;
  if (deltaMs < 0) return 'just now';
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format context-window token counts for model rows. */
export function formatContextWindow(tokens: number | undefined): string {
  if (tokens === undefined || tokens === 0) return 'n/a';
  return formatTokenCount(tokens, true);
}

/** Format agent model value from either string or `{ primary }` object. */
export function formatAgentModel(model: unknown): string {
  if (typeof model === 'string') return model;
  if (typeof model === 'object' && model !== null) {
    const m = model as Record<string, unknown>;
    if (typeof m.primary === 'string') return m.primary;
  }
  return 'n/a';
}

/** Map connection state to semantic color classes. */
export function connectionClass(state: ConnectionState): string {
  if (state === 'connected') return 'font-medium text-terminal-green';
  if (state === 'error' || state === 'disconnected') return 'font-medium text-terminal-error';
  return 'font-medium text-terminal-amber';
}

/** Render loading skeleton rows for panel placeholders. */
export function renderSkeletonRows(count = 3): string {
  return Array.from({ length: count })
    .map(() => '<li class="skeleton-row" aria-label="Loading"></li>')
    .join('');
}

/** Bucket gateway event names for Activity Feed filter chips. */
export function eventBucket(name: string): string {
  if (name === 'cron') return 'cron';
  if (name === 'heartbeat' || name === 'tick') return 'heartbeat';
  if (name === 'health') return 'health';
  if (name === 'presence') return 'presence';
  if (name === 'session.tool') return 'tool';
  if (name === 'session.message') return 'message';
  if (name.startsWith('exec.approval.') || name.startsWith('plugin.approval.')) return 'permission';
  if (name.startsWith('file.')) return 'file';
  if (name.startsWith('message.')) return 'message';
  if (name.startsWith('session.')) return 'session';
  return 'other';
}

/** Render optional channel error detail line. */
export function channelErrorDetail(lastError: string | null | undefined): string {
  return lastError
    ? `<p class="mt-1 text-terminal-error">${escapeHtml(lastError)}</p>`
    : '';
}
