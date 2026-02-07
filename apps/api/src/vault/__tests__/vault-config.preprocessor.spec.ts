import { VaultConfigPreprocessor } from "../vault-config.preprocessor";
import type { OpenClawManifest } from "@clawster/core";
import type { PreprocessorContext } from "../../reconciler/interfaces";

describe("VaultConfigPreprocessor", () => {
  let preprocessor: VaultConfigPreprocessor;

  beforeEach(() => {
    preprocessor = new VaultConfigPreprocessor();
  });

  const makeManifest = (openclawConfig: Record<string, unknown> = {}): OpenClawManifest => ({
    spec: { openclawConfig },
  }) as unknown as OpenClawManifest;

  const makeContext = (): PreprocessorContext => ({
    instance: { id: "inst-1" },
  }) as unknown as PreprocessorContext;

  it("has name 'vault-config'", () => {
    expect(preprocessor.name).toBe("vault-config");
  });

  it("has priority 40", () => {
    expect(preprocessor.priority).toBe(40);
  });

  describe("process", () => {
    it("returns modified: true", async () => {
      const manifest = makeManifest({});
      const result = await preprocessor.process(manifest, makeContext());

      expect(result.modified).toBe(true);
    });

    it("adds group:runtime to tools.alsoAllow when no tools.allow exists", async () => {
      const manifest = makeManifest({});
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const tools = cfg.tools as Record<string, unknown>;
      expect(tools.alsoAllow).toContain("group:runtime");
    });

    it("adds group:runtime to tools.allow when allow list exists", async () => {
      const manifest = makeManifest({
        tools: { allow: ["group:read"] },
      });
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const tools = cfg.tools as Record<string, unknown>;
      expect(tools.allow).toContain("group:runtime");
      expect(tools.allow).toContain("group:read");
    });

    it("does not duplicate group:runtime if already present in allow", async () => {
      const manifest = makeManifest({
        tools: { allow: ["group:runtime", "group:read"] },
      });
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const tools = cfg.tools as Record<string, unknown>;
      const allow = tools.allow as string[];
      expect(allow.filter((t) => t === "group:runtime")).toHaveLength(1);
    });

    it("does not duplicate group:runtime if already present in alsoAllow", async () => {
      const manifest = makeManifest({
        tools: { alsoAllow: ["group:runtime"] },
      });
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const tools = cfg.tools as Record<string, unknown>;
      const alsoAllow = tools.alsoAllow as string[];
      expect(alsoAllow.filter((t) => t === "group:runtime")).toHaveLength(1);
    });

    it("adds skill path to skills.load.extraDirs", async () => {
      const manifest = makeManifest({});
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const skills = cfg.skills as Record<string, unknown>;
      const load = skills.load as Record<string, unknown>;
      expect(load.extraDirs).toContain("/home/node/.openclaw/skills");
    });

    it("preserves existing extraDirs entries", async () => {
      const manifest = makeManifest({
        skills: { load: { extraDirs: ["/existing/path"] } },
      });
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const skills = cfg.skills as Record<string, unknown>;
      const load = skills.load as Record<string, unknown>;
      const dirs = load.extraDirs as string[];
      expect(dirs).toContain("/existing/path");
      expect(dirs).toContain("/home/node/.openclaw/skills");
    });

    it("does not duplicate skill path if already present", async () => {
      const manifest = makeManifest({
        skills: { load: { extraDirs: ["/home/node/.openclaw/skills"] } },
      });
      await preprocessor.process(manifest, makeContext());

      const cfg = manifest.spec.openclawConfig as Record<string, unknown>;
      const skills = cfg.skills as Record<string, unknown>;
      const load = skills.load as Record<string, unknown>;
      const dirs = load.extraDirs as string[];
      expect(dirs.filter((d) => d === "/home/node/.openclaw/skills")).toHaveLength(1);
    });
  });
});
