import type { MainframeProfile } from './types';

/**
 * Sprawl Lab — the default open-source demo profile.
 *
 * Designed for distributed agent labs, incident drills, and cyberpunk-style
 * operational visibility. All operational data comes from the live gateway;
 * this profile contains only hero branding and display metadata.
 */
export const sprawlLabProfile: MainframeProfile = {
  id: 'sprawl-lab',
  label: 'Sprawl Lab',
  heroTag: 'ClawSprawl / Neon Grid',
  heroTitle: 'Sprawl Lab',
  heroDescription:
    'ClawSprawl runs a distributed agent lab tuned for open collaboration, incident drills, and cyberpunk-style operational visibility.',
  statGateway: 'WS :18789',
  statAccess: 'VPN or private mesh',
};
