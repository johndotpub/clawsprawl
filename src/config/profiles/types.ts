/**
 * Mainframe profile — branding-only configuration for dashboard chrome.
 *
 * Profiles control hero section copy, cluster labels, and gateway display
 * metadata. They contain **zero** operational data — all agent/session/model
 * information comes exclusively from the live WebSocket connection.
 *
 * @see {@link resolveMainframeProfile} in `index.ts` for runtime resolution.
 */
export interface MainframeProfile {
  /** Unique slug used for profile lookup (e.g. `"sprawl-lab"`). */
  id: string;
  /** Human-readable display label (e.g. `"Sprawl Lab"`). */
  label: string;
  /** Subtitle tag rendered above the hero title (e.g. `"ClawSprawl / Neon Grid"`). */
  heroTag: string;
  /** Primary hero heading text. */
  heroTitle: string;
  /** Hero description paragraph — one or two sentences of marketing copy. */
  heroDescription: string;
  /** Gateway connection display string (e.g. `"WS :18789"`). Cosmetic only. */
  statGateway: string;
  /** Access model display string (e.g. `"VPN or private mesh"`). Cosmetic only. */
  statAccess: string;
}
