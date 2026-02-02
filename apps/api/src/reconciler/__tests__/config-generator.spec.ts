import { ConfigGeneratorService } from "../config-generator.service";
import type { OpenClawManifest, OpenClawFullConfig } from "@clawster/core";

describe("ConfigGeneratorService", () => {
  let service: ConfigGeneratorService;

  beforeEach(() => {
    service = new ConfigGeneratorService();
  });

  function createManifest(
    overrides: {
      environment?: string;
      openclawConfig?: Partial<OpenClawFullConfig>;
      securityOverrides?: Record<string, unknown>;
    } = {},
  ): OpenClawManifest {
    return {
      apiVersion: "clawster/v2",
      metadata: {
        name: "test-bot",
        environment: (overrides.environment ?? "dev") as "dev" | "staging" | "prod" | "local",
        ...(overrides.securityOverrides
          ? { securityOverrides: overrides.securityOverrides as OpenClawManifest["metadata"]["securityOverrides"] }
          : {}),
      },
      spec: {
        openclawConfig: (overrides.openclawConfig ?? {}) as OpenClawFullConfig,
      },
    } as OpenClawManifest;
  }

  describe("generateOpenClawConfig", () => {
    it("applies gateway defaults when not provided", () => {
      const config = service.generateOpenClawConfig(createManifest());
      expect(config.gateway).toBeDefined();
      expect(config.gateway!.port).toBe(18789);
      expect(config.gateway!.host).toBe("127.0.0.1");
    });

    it("preserves explicit gateway settings", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          openclawConfig: {
            gateway: { port: 19000, host: "0.0.0.0" },
          } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.gateway!.port).toBe(19000);
      expect(config.gateway!.host).toBe("0.0.0.0");
    });

    it("sets log level to debug for dev", () => {
      const config = service.generateOpenClawConfig(createManifest({ environment: "dev" }));
      expect(config.logging?.level).toBe("debug");
    });

    it("sets log level to info for staging", () => {
      const config = service.generateOpenClawConfig(createManifest({ environment: "staging" }));
      expect(config.logging?.level).toBe("info");
    });

    it("sets log level to warn for prod", () => {
      const config = service.generateOpenClawConfig(createManifest({ environment: "prod" }));
      expect(config.logging?.level).toBe("warn");
    });

    it("preserves explicit log level", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          openclawConfig: { logging: { level: "error" } } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.logging?.level).toBe("error");
    });
  });

  describe("secure defaults enforcement", () => {
    it("auto-generates gateway auth token when missing", () => {
      const config = service.generateOpenClawConfig(createManifest());
      expect(config.gateway?.auth).toBeDefined();
      expect(config.gateway!.auth!.token).toBeDefined();
      expect(config.gateway!.auth!.token).toHaveLength(64);
    });

    it("does not overwrite existing gateway auth token", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          openclawConfig: { gateway: { port: 18789, auth: { token: "my-token" } } } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.gateway!.auth!.token).toBe("my-token");
    });

    it("skips auth auto-gen when allowOpenGateway override is set", () => {
      const config = service.generateOpenClawConfig(
        createManifest({ securityOverrides: { allowOpenGateway: true } }),
      );
      expect(config.gateway?.auth?.token).toBeUndefined();
    });

    it("forces sandbox to 'all' in prod when mode is 'off'", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          environment: "prod",
          openclawConfig: { sandbox: { mode: "off" } } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.sandbox?.mode).toBe("all");
    });

    it("forces sandbox to 'all' in staging when mode is 'off'", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          environment: "staging",
          openclawConfig: { sandbox: { mode: "off" } } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.sandbox?.mode).toBe("all");
    });

    it("does not force sandbox in dev environment", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          environment: "dev",
          openclawConfig: { sandbox: { mode: "off" } } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.sandbox?.mode).toBe("off");
    });

    it("disables elevated tools when allowFrom is empty", () => {
      const config = service.generateOpenClawConfig(
        createManifest({
          openclawConfig: {
            tools: { elevated: { enabled: true, allowFrom: [] } },
          } as Partial<OpenClawFullConfig>,
        }),
      );
      expect(config.tools?.elevated?.enabled).toBe(false);
    });

    it("sets redactSensitive to 'tools' when not provided", () => {
      const config = service.generateOpenClawConfig(createManifest());
      expect(config.logging?.redactSensitive).toBe("tools");
    });
  });

  describe("generateConfigHash", () => {
    it("produces a hex string", () => {
      const hash = service.generateConfigHash({} as OpenClawFullConfig);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("is deterministic", () => {
      const config = { gateway: { port: 18789 } } as OpenClawFullConfig;
      expect(service.generateConfigHash(config)).toBe(service.generateConfigHash(config));
    });

    it("is key-order independent", () => {
      const c1 = { gateway: { port: 18789, host: "localhost" } } as unknown as OpenClawFullConfig;
      const c2 = { gateway: { host: "localhost", port: 18789 } } as unknown as OpenClawFullConfig;
      expect(service.generateConfigHash(c1)).toBe(service.generateConfigHash(c2));
    });

    it("different configs produce different hashes", () => {
      const h1 = service.generateConfigHash({ gateway: { port: 18789 } } as OpenClawFullConfig);
      const h2 = service.generateConfigHash({ gateway: { port: 19000 } } as OpenClawFullConfig);
      expect(h1).not.toBe(h2);
    });
  });
});
