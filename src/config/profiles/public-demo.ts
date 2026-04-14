import type { MainframeProfile } from './types';

/**
 * Public Demo — a clean, generic profile for self-hosted or public instances.
 *
 * Suitable for showcasing ClawSprawl without Sprawl Lab–specific branding.
 * All operational data comes from the live gateway; this profile contains
 * only hero branding and display metadata.
 */
export const publicDemoProfile: MainframeProfile = {
  id: 'public-demo',
  label: 'Public Demo',
  heroTag: 'ClawSprawl / Open Mainframe',
  heroTitle: 'Public Demo',
  heroDescription:
    'ClawSprawl is an open-source operations surface for orchestrating agent swarms, monitoring automation health, and triaging incidents in real time.',
  statGateway: 'WS :18789',
  statAccess: 'Internal or self-hosted',
};
