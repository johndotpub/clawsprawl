import { describe, expect, it } from 'vitest';
import { listProfileIds, registerLocalProfiles, resolveMainframeProfile } from './index';
import type { MainframeProfile } from './types';

describe('mainframe profiles', () => {
  it('exposes public profile ids', () => {
    const ids = listProfileIds();
    expect(ids).toContain('public-demo');
    expect(ids).toContain('sprawl-lab');
  });

  it('defaults to sprawl-lab profile for unknown ids', () => {
    const profile = resolveMainframeProfile('unknown-profile');
    expect(profile.id).toBe('sprawl-lab');
  });

  it('resolves named public profile when requested', () => {
    const profile = resolveMainframeProfile('sprawl-lab');
    expect(profile.id).toBe('sprawl-lab');
    expect(profile.heroTitle).toBe('Sprawl Lab');
  });

  it('registers local profiles with valid ids', () => {
    const target = {} as Record<string, MainframeProfile>;
    const localProfile: MainframeProfile = {
      id: 'private-local',
      label: 'Private Local',
      heroTag: 'x',
      heroTitle: 'x',
      heroDescription: 'x',
      statAccess: 'x',
      statGateway: 'WS :18789',
    };

    registerLocalProfiles(target, {
      './private.local.ts': { localProfile },
    });

    expect(target['private-local']).toBe(localProfile);
  });

  it('skips local modules without profile ids', () => {
    const target = {} as Record<string, MainframeProfile>;

    registerLocalProfiles(target, {
      './empty.local.ts': {},
    });

    expect(Object.keys(target)).toHaveLength(0);
  });
});
