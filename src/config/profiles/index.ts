import { publicDemoProfile } from './public-demo';
import { sprawlLabProfile } from './sprawl-lab';
import type { MainframeProfile } from './types';

/** Registry of built-in profiles keyed by profile ID. */
const profiles: Record<string, MainframeProfile> = {
  [sprawlLabProfile.id]: sprawlLabProfile,
  [publicDemoProfile.id]: publicDemoProfile,
};

/** Auto-discover optional `*.local.ts` profile modules at build time. */
const localModules = import.meta.glob('./*.local.ts', { eager: true }) as Record<string, { localProfile?: MainframeProfile }>;

/**
 * Merge local profile modules into the target registry.
 * Each module must export a `localProfile` conforming to {@link MainframeProfile}.
 *
 * @param target - The profile registry to merge into.
 * @param modules - Map of module paths to their exports containing an optional `localProfile`.
 * @returns void
 */
export function registerLocalProfiles(
  target: Record<string, MainframeProfile>,
  modules: Record<string, { localProfile?: MainframeProfile }>,
): void {
  for (const modulePath of Object.keys(modules)) {
    const localProfile = modules[modulePath]?.localProfile;
    if (localProfile?.id) {
      target[localProfile.id] = localProfile;
    }
  }
}

registerLocalProfiles(profiles, localModules);

/**
 * Return all registered profile IDs.
 *
 * @returns An array of all registered profile ID strings.
 */
export function listProfileIds(): string[] {
  return Object.keys(profiles);
}

/**
 * Resolve a {@link MainframeProfile} by ID.
 * Falls back to `sprawl-lab` if the requested profile is not found.
 *
 * @param profileId - Optional profile ID to look up.
 * @returns The matching {@link MainframeProfile}, or the default `sprawl-lab` profile.
 */
export function resolveMainframeProfile(profileId?: string): MainframeProfile {
  if (profileId && profiles[profileId]) {
    return profiles[profileId];
  }
  return sprawlLabProfile;
}
