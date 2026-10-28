// ---------------------------------------------------------------------------
// src/lib/gateway/capabilities.ts
//
// Typed helpers over the gateway's advertised feature surface (hello-ok
// `features.methods` / `features.events` / `features.capabilities`). The
// dashboard renders only what the connected gateway actually supports, so
// panels degrade gracefully instead of erroring against older gateways.
//
// Capability names are the OpenClaw client-capability registry (see
// docs.openclaw.ai gateway/clients.md). Unknown strings are allowed so a
// newer gateway can advertise capabilities this build does not know yet.
// ---------------------------------------------------------------------------

import type { HelloOk } from "./types";

/**
 * Capability names this client knows about. The registry is open — a gateway
 * may advertise names not listed here (and the dashboard ignores them unless
 * explicitly consumed).
 */
export type KnownCapability =
 | "agent-kind"
 | "tool-events"
 | "session-scoped-events"
 | "usage-refreshing"
 | "progress-card-agent-scope-v1"
 | "inline-widgets"
 | "ui-commands"
 | "approvals"
 | "exec-approvals";

/** Capabilities this dashboard build honestly implements and advertises. */
export const DASHBOARD_CAPABILITIES = [
 // Opts into the typed `agents.list` roster (system vs agent rows).
 "agent-kind",
 // `session.tool` events are bucketed and rendered in the activity feed.
 "tool-events",
 // Events are consumed per-session (invalidation keyed on session activity).
 "session-scoped-events",
 // Usage panels refetch on invalidation events rather than caching cold.
 "usage-refreshing",
] as const;

/**
 * Check whether a capability is present in an advertised capability list.
 * Safe on undefined/null (disconnected client) — returns `false`.
 *
 * @param capabilities - Advertised capability list (or undefined).
 * @param cap - Capability name to check.
 * @returns `true` when the list contains the capability.
 */
export function hasCapability(
 capabilities: string[] | undefined | null,
 cap: string,
): boolean {
 return Array.isArray(capabilities) && capabilities.includes(cap);
}

/**
 * Gateway-advertised RPC method names (from hello-ok `features.methods`).
 * Returns an empty array when disconnected or the field is absent.
 *
 * @param helloOk - The handshake payload (or null before connect).
 * @returns Advertised method names.
 */
export function advertisedMethods(
 helloOk: HelloOk | null | undefined,
): string[] {
 return helloOk?.features?.methods ?? [];
}

/**
 * Convenience: is a specific RPC method advertised by the gateway?
 *
 * @param helloOk - The handshake payload (or null before connect).
 * @param method - RPC method name to check.
 * @returns `true` when the gateway advertises the method.
 */
export function hasMethod(
 helloOk: HelloOk | null | undefined,
 method: string,
): boolean {
 return advertisedMethods(helloOk).includes(method);
}
