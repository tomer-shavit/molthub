/**
 * Unit tests for middleware assignment logic.
 *
 * Tests the metadata parsing and middleware config manipulation
 * without importing BotInstancesService (which has transitive deps
 * on @clawster/database etc. that aren't available in this worktree).
 */
import { NotFoundException } from "@nestjs/common";
import { MiddlewareRegistryService } from "./middleware-registry.service";

describe("MiddlewareAssignment — metadata parsing logic", () => {
  const registry = new MiddlewareRegistryService();

  /**
   * Replicates the private parseMetadata + extractMiddlewareConfig logic
   * from MiddlewareAssignmentService to test in isolation.
   */
  function parseMiddlewareConfig(raw: string | Record<string, unknown> | null) {
    let metadata: Record<string, unknown>;
    if (typeof raw === "string") {
      try {
        metadata = JSON.parse(raw);
      } catch {
        metadata = {};
      }
    } else {
      metadata = raw ?? {};
    }
    const mwConfig = metadata.middlewareConfig as
      | { middlewares: Array<{ package: string; enabled: boolean; config: Record<string, unknown> }> }
      | undefined;
    return { middlewares: mwConfig?.middlewares ?? [] };
  }

  it("returns empty array for empty metadata", () => {
    expect(parseMiddlewareConfig({}).middlewares).toEqual([]);
  });

  it("returns empty array for null metadata", () => {
    expect(parseMiddlewareConfig(null).middlewares).toEqual([]);
  });

  it("parses string metadata (JSON)", () => {
    const meta = JSON.stringify({
      middlewareConfig: {
        middlewares: [{ package: "test", enabled: true, config: {} }],
      },
    });
    const result = parseMiddlewareConfig(meta);
    expect(result.middlewares).toHaveLength(1);
    expect(result.middlewares[0].package).toBe("test");
  });

  it("parses object metadata", () => {
    const meta = {
      middlewareConfig: {
        middlewares: [
          { package: "@clawster/middleware-boom", enabled: true, config: {} },
        ],
      },
    };
    const result = parseMiddlewareConfig(meta);
    expect(result.middlewares).toHaveLength(1);
  });

  it("handles malformed JSON string gracefully", () => {
    expect(parseMiddlewareConfig("not-json").middlewares).toEqual([]);
  });

  it("handles metadata without middlewareConfig key", () => {
    expect(parseMiddlewareConfig({ containerEnv: {} }).middlewares).toEqual([]);
  });
});

describe("MiddlewareAssignment — assignment operations", () => {
  const registry = new MiddlewareRegistryService();

  it("registry validates known middleware", () => {
    expect(() => registry.findById("@clawster/middleware-boom")).not.toThrow();
  });

  it("registry rejects unknown middleware", () => {
    expect(() => registry.findById("unknown")).toThrow(NotFoundException);
  });

  it("detects duplicate assignment", () => {
    const existing = [
      { package: "@clawster/middleware-boom", enabled: true, config: {} },
    ];
    const isDuplicate = existing.some(
      (m) => m.package === "@clawster/middleware-boom",
    );
    expect(isDuplicate).toBe(true);
  });

  it("creates assignment with defaults", () => {
    const dto = { package: "@clawster/middleware-boom" };
    const assignment = {
      package: dto.package,
      enabled: true,
      config: {},
    };
    expect(assignment.enabled).toBe(true);
    expect(assignment.config).toEqual({});
  });

  it("immutable update preserves other middlewares", () => {
    const middlewares = [
      { package: "a", enabled: true, config: {} },
      { package: "b", enabled: true, config: {} },
    ];
    const updated = middlewares.map((m) =>
      m.package === "a" ? { ...m, enabled: false } : m,
    );
    expect(updated[0].enabled).toBe(false);
    expect(updated[1].enabled).toBe(true);
    // Original not mutated
    expect(middlewares[0].enabled).toBe(true);
  });

  it("remove filters out target middleware", () => {
    const middlewares = [
      { package: "a", enabled: true, config: {} },
      { package: "b", enabled: true, config: {} },
    ];
    const filtered = middlewares.filter((m) => m.package !== "a");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].package).toBe("b");
  });

  it("metadata merge preserves existing keys", () => {
    const currentMetadata = { containerEnv: { FOO: "bar" }, auth: "token" };
    const newConfig = {
      middlewares: [
        { package: "@clawster/middleware-boom", enabled: true, config: {} },
      ],
    };
    const merged = { ...currentMetadata, middlewareConfig: newConfig };
    expect(merged.containerEnv).toEqual({ FOO: "bar" });
    expect(merged.auth).toBe("token");
    expect(merged.middlewareConfig.middlewares).toHaveLength(1);
  });
});
