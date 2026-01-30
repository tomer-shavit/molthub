import { describe, it, expect } from "vitest";
import {
  MoltbotProfileSchema,
  MoltbotProfileRegistrySchema,
  MIN_PORT_SPACING,
  serviceName,
  profileEnvVars,
} from "../moltbot-profile";

describe("MoltbotProfileSchema", () => {
  function createProfile(overrides: Record<string, unknown> = {}) {
    return {
      name: "main",
      port: 18789,
      configPath: "/etc/moltbot/main.json",
      stateDir: "/var/moltbot/main",
      workspace: "~/clawd-main",
      ...overrides,
    };
  }

  it("validates a minimal valid profile", () => {
    const result = MoltbotProfileSchema.safeParse(createProfile());
    expect(result.success).toBe(true);
  });

  it("applies default enabled=true", () => {
    const parsed = MoltbotProfileSchema.parse(createProfile());
    expect(parsed.enabled).toBe(true);
  });

  it("accepts optional description", () => {
    const result = MoltbotProfileSchema.safeParse(
      createProfile({ description: "Primary bot" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts enabled=false", () => {
    const parsed = MoltbotProfileSchema.parse(
      createProfile({ enabled: false }),
    );
    expect(parsed.enabled).toBe(false);
  });

  describe("name validation", () => {
    it("accepts lowercase alphanumeric names", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "bot1" })).success,
      ).toBe(true);
    });

    it("accepts names with hyphens", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "my-bot" }))
          .success,
      ).toBe(true);
    });

    it("accepts single character names", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "a" })).success,
      ).toBe(true);
    });

    it("rejects names starting with hyphen", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "-bot" })).success,
      ).toBe(false);
    });

    it("rejects names ending with hyphen", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "bot-" })).success,
      ).toBe(false);
    });

    it("rejects uppercase names", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "MyBot" }))
          .success,
      ).toBe(false);
    });

    it("rejects empty names", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ name: "" })).success,
      ).toBe(false);
    });

    it("rejects names over 63 characters", () => {
      expect(
        MoltbotProfileSchema.safeParse(
          createProfile({ name: "a".repeat(64) }),
        ).success,
      ).toBe(false);
    });
  });

  describe("port validation", () => {
    it("accepts valid port numbers", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ port: 1 })).success,
      ).toBe(true);
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ port: 65535 })).success,
      ).toBe(true);
    });

    it("rejects port 0", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ port: 0 })).success,
      ).toBe(false);
    });

    it("rejects ports above 65535", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ port: 65536 })).success,
      ).toBe(false);
    });

    it("rejects fractional ports", () => {
      expect(
        MoltbotProfileSchema.safeParse(createProfile({ port: 18789.5 }))
          .success,
      ).toBe(false);
    });
  });

  it("requires configPath, stateDir, workspace", () => {
    const { configPath, ...noConfig } = createProfile();
    expect(MoltbotProfileSchema.safeParse(noConfig).success).toBe(false);

    const { stateDir, ...noState } = createProfile();
    expect(MoltbotProfileSchema.safeParse(noState).success).toBe(false);

    const { workspace, ...noWorkspace } = createProfile();
    expect(MoltbotProfileSchema.safeParse(noWorkspace).success).toBe(false);
  });
});

describe("MoltbotProfileRegistrySchema", () => {
  function createRegistry(profiles: Array<Record<string, unknown>>) {
    return { profiles };
  }

  const profileA = {
    name: "main",
    port: 18789,
    configPath: "/a.json",
    stateDir: "/a",
    workspace: "/a",
  };

  const profileB = {
    name: "secondary",
    port: 18809,
    configPath: "/b.json",
    stateDir: "/b",
    workspace: "/b",
  };

  it("accepts profiles with sufficient port spacing", () => {
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([profileA, profileB]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects profiles with port spacing < 20", () => {
    const tooClose = { ...profileB, port: 18790 };
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([profileA, tooClose]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        String(MIN_PORT_SPACING),
      );
    }
  });

  it("accepts exactly 20 port gap", () => {
    const exactly20 = { ...profileB, port: 18809 }; // 18809 - 18789 = 20
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([profileA, exactly20]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects duplicate profile names", () => {
    const duplicate = { ...profileB, name: "main" };
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([profileA, duplicate]),
    );
    expect(result.success).toBe(false);
  });

  it("ignores port spacing for disabled profiles", () => {
    const disabled = { ...profileB, port: 18790, enabled: false };
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([{ ...profileA, enabled: true }, disabled]),
    );
    expect(result.success).toBe(true);
  });

  it("validates port spacing across three profiles", () => {
    const profileC = {
      name: "third",
      port: 18829,
      configPath: "/c.json",
      stateDir: "/c",
      workspace: "/c",
    };
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([profileA, profileB, profileC]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects three profiles when middle one is too close", () => {
    const profileC = {
      name: "third",
      port: 18815,
      configPath: "/c.json",
      stateDir: "/c",
      workspace: "/c",
    };
    // B at 18809, C at 18815 -> gap of 6 (too close)
    const result = MoltbotProfileRegistrySchema.safeParse(
      createRegistry([profileA, profileB, profileC]),
    );
    expect(result.success).toBe(false);
  });

  it("requires at least one profile", () => {
    const result = MoltbotProfileRegistrySchema.safeParse(createRegistry([]));
    expect(result.success).toBe(false);
  });
});

describe("MIN_PORT_SPACING", () => {
  it("is 20", () => {
    expect(MIN_PORT_SPACING).toBe(20);
  });
});

describe("serviceName", () => {
  it("generates macOS service name", () => {
    expect(serviceName("main", "macos")).toBe("bot.molt.main");
    expect(serviceName("rescue", "macos")).toBe("bot.molt.rescue");
    expect(serviceName("my-bot", "macos")).toBe("bot.molt.my-bot");
  });

  it("generates Linux service name", () => {
    expect(serviceName("main", "linux")).toBe(
      "moltbot-gateway-main.service",
    );
    expect(serviceName("rescue", "linux")).toBe(
      "moltbot-gateway-rescue.service",
    );
    expect(serviceName("my-bot", "linux")).toBe(
      "moltbot-gateway-my-bot.service",
    );
  });
});

describe("profileEnvVars", () => {
  it("returns correct environment variables", () => {
    const env = profileEnvVars({
      name: "main",
      port: 18789,
      configPath: "/etc/moltbot/main.json",
      stateDir: "/var/moltbot/main",
      workspace: "~/clawd-main",
      enabled: true,
    });

    expect(env).toEqual({
      CLAWDBOT_CONFIG_PATH: "/etc/moltbot/main.json",
      CLAWDBOT_STATE_DIR: "/var/moltbot/main",
    });
  });

  it("uses the profile's configPath and stateDir", () => {
    const env = profileEnvVars({
      name: "custom",
      port: 19001,
      configPath: "/custom/config.json",
      stateDir: "/custom/state",
      workspace: "/custom/workspace",
      enabled: true,
    });

    expect(env.CLAWDBOT_CONFIG_PATH).toBe("/custom/config.json");
    expect(env.CLAWDBOT_STATE_DIR).toBe("/custom/state");
  });
});
