import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CAPABILITIES,
  advertisedMethods,
  hasCapability,
  hasMethod,
} from "./capabilities";
import type { HelloOk } from "./types";

/** Minimal HelloOk fixture for capability tests. */
function makeHelloOk(overrides: Partial<HelloOk["features"]> = {}): HelloOk {
  return {
    type: "hello-ok",
    protocol: 4,
    server: { version: "2026.9.4", connId: "conn-test" },
    features: {
      methods: ["status", "agents.list", "progressCard.get"],
      events: ["tick", "health"],
      ...overrides,
    },
    snapshot: {
      presence: [],
      health: { ok: true, ts: 0 },
      stateVersion: { presence: 0, health: 0 },
      uptimeMs: 1000,
    },
    policy: {
      maxPayload: 1_048_576,
      maxBufferedBytes: 4_194_304,
      tickIntervalMs: 15_000,
    },
  };
}

describe("gateway capabilities helpers", () => {
  describe("hasCapability", () => {
    it("returns true when the capability is present", () => {
      expect(hasCapability(["agent-kind", "tool-events"], "tool-events")).toBe(
        true,
      );
    });

    it("returns false when absent", () => {
      expect(hasCapability(["agent-kind"], "tool-events")).toBe(false);
    });

    it("returns false for undefined/null lists (disconnected client)", () => {
      expect(hasCapability(undefined, "agent-kind")).toBe(false);
      expect(hasCapability(null, "agent-kind")).toBe(false);
    });

    it("returns false for an empty list", () => {
      expect(hasCapability([], "agent-kind")).toBe(false);
    });
  });

  describe("DASHBOARD_CAPABILITIES", () => {
    it("includes the four honestly-implemented capabilities", () => {
      expect(DASHBOARD_CAPABILITIES).toContain("agent-kind");
      expect(DASHBOARD_CAPABILITIES).toContain("tool-events");
      expect(DASHBOARD_CAPABILITIES).toContain("session-scoped-events");
      expect(DASHBOARD_CAPABILITIES).toContain("usage-refreshing");
    });

    it("does not advertise capabilities the dashboard does not implement", () => {
      // Read-only dashboard: never claim approval/ui-command surfaces.
      expect(DASHBOARD_CAPABILITIES).not.toContain("approvals");
      expect(DASHBOARD_CAPABILITIES).not.toContain("exec-approvals");
      expect(DASHBOARD_CAPABILITIES).not.toContain("ui-commands");
      // Progress cards are gated on runtime capability detection, not advertised unconditionally.
      expect(DASHBOARD_CAPABILITIES).not.toContain(
        "progress-card-agent-scope-v1",
      );
    });
  });

  describe("advertisedMethods", () => {
    it("returns the hello-ok methods list", () => {
      const helloOk = makeHelloOk();
      expect(advertisedMethods(helloOk)).toEqual([
        "status",
        "agents.list",
        "progressCard.get",
      ]);
    });

    it("returns empty array for null (disconnected)", () => {
      expect(advertisedMethods(null)).toEqual([]);
      expect(advertisedMethods(undefined)).toEqual([]);
    });

    it("returns empty array when features field is absent", () => {
      const helloOk = {
        type: "hello-ok",
        protocol: 4,
        server: { version: "x", connId: "c" },
      } as unknown as HelloOk;
      expect(advertisedMethods(helloOk)).toEqual([]);
    });
  });

  describe("hasMethod", () => {
    it("returns true for an advertised method", () => {
      expect(hasMethod(makeHelloOk(), "progressCard.get")).toBe(true);
    });

    it("returns false for an unadvertised method", () => {
      expect(hasMethod(makeHelloOk(), "tasks.list")).toBe(false);
    });

    it("returns false when disconnected", () => {
      expect(hasMethod(null, "status")).toBe(false);
    });
  });
});
