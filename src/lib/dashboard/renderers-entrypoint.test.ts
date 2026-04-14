import { describe, expect, it } from 'vitest';
import {
  connectionClass,
  escapeHtml,
  eventBucket,
  formatAge,
  formatContextWindow,
  renderSkeletonRows,
} from './renderers';

describe('dashboard renderers entrypoint', () => {
  it('re-exports shared renderer helpers', () => {
    expect(connectionClass('connected')).toContain('text-terminal-green');
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
    expect(eventBucket('session.tool')).toBe('tool');
    expect(typeof formatAge(Date.now() - 1000)).toBe('string');
    expect(formatContextWindow(4096).toLowerCase()).toContain('k');
    expect(renderSkeletonRows(2)).toContain('skeleton-row');
  });
});
