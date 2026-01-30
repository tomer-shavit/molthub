import { describe, it, expect } from "vitest";
import {
  DANGEROUS_TOOL_PATTERNS,
  ELEVATED_ONLY_TOOLS,
  getDefaultDenyList,
  isToolDenied,
} from "../tool-security";

describe("DANGEROUS_TOOL_PATTERNS", () => {
  it("includes password manager CLIs", () => {
    expect(DANGEROUS_TOOL_PATTERNS).toContain("op");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("bw");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("lpass");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("keepassxc-cli");
  });

  it("includes OS credential store tools", () => {
    expect(DANGEROUS_TOOL_PATTERNS).toContain("security");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("secret-tool");
  });

  it("includes browser credential patterns", () => {
    expect(DANGEROUS_TOOL_PATTERNS).toContain("browser:password-*");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("browser:autofill-*");
  });

  it("includes wildcard variants", () => {
    expect(DANGEROUS_TOOL_PATTERNS).toContain("op:*");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("bw:*");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("lpass:*");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("security:*");
    expect(DANGEROUS_TOOL_PATTERNS).toContain("secret-tool:*");
  });
});

describe("ELEVATED_ONLY_TOOLS", () => {
  it("includes sudo and su", () => {
    expect(ELEVATED_ONLY_TOOLS).toContain("shell:sudo");
    expect(ELEVATED_ONLY_TOOLS).toContain("shell:su");
  });

  it("includes docker tools", () => {
    expect(ELEVATED_ONLY_TOOLS).toContain("docker:exec");
    expect(ELEVATED_ONLY_TOOLS).toContain("docker:run");
  });

  it("includes system tools", () => {
    expect(ELEVATED_ONLY_TOOLS).toContain("system:reboot");
    expect(ELEVATED_ONLY_TOOLS).toContain("system:shutdown");
    expect(ELEVATED_ONLY_TOOLS).toContain("system:service-restart");
  });

  it("has exactly 7 tools", () => {
    expect(ELEVATED_ONLY_TOOLS).toHaveLength(7);
  });
});

describe("getDefaultDenyList", () => {
  it("minimal profile blocks dangerous + elevated", () => {
    const list = getDefaultDenyList("minimal");
    for (const pattern of DANGEROUS_TOOL_PATTERNS) {
      expect(list).toContain(pattern);
    }
    for (const tool of ELEVATED_ONLY_TOOLS) {
      expect(list).toContain(tool);
    }
  });

  it("coding profile allows docker:exec and docker:run", () => {
    const list = getDefaultDenyList("coding");
    expect(list).not.toContain("docker:exec");
    expect(list).not.toContain("docker:run");
    // Still blocks other elevated tools
    expect(list).toContain("shell:sudo");
    expect(list).toContain("system:reboot");
  });

  it("messaging profile blocks dangerous + elevated", () => {
    const list = getDefaultDenyList("messaging");
    for (const pattern of DANGEROUS_TOOL_PATTERNS) {
      expect(list).toContain(pattern);
    }
    for (const tool of ELEVATED_ONLY_TOOLS) {
      expect(list).toContain(tool);
    }
  });

  it("full profile blocks dangerous but allows elevated", () => {
    const list = getDefaultDenyList("full");
    for (const pattern of DANGEROUS_TOOL_PATTERNS) {
      expect(list).toContain(pattern);
    }
    for (const tool of ELEVATED_ONLY_TOOLS) {
      expect(list).not.toContain(tool);
    }
  });

  it("unknown profile defaults to minimal behavior", () => {
    const list = getDefaultDenyList("unknown-profile");
    for (const pattern of DANGEROUS_TOOL_PATTERNS) {
      expect(list).toContain(pattern);
    }
    for (const tool of ELEVATED_ONLY_TOOLS) {
      expect(list).toContain(tool);
    }
  });
});

describe("isToolDenied", () => {
  it("returns true for exact match", () => {
    expect(isToolDenied("op", ["op", "bw"])).toBe(true);
  });

  it("returns false when not in deny list", () => {
    expect(isToolDenied("git", ["op", "bw"])).toBe(false);
  });

  it("matches wildcard patterns", () => {
    expect(isToolDenied("op:get", ["op:*"])).toBe(true);
    expect(isToolDenied("op:list", ["op:*"])).toBe(true);
  });

  it("matches the base of a wildcard pattern", () => {
    // "op:*" should also match "op" itself
    expect(isToolDenied("op", ["op:*"])).toBe(true);
  });

  it("does not match partial prefixes without wildcard", () => {
    expect(isToolDenied("opera", ["op"])).toBe(false);
  });

  it("returns false for empty deny list", () => {
    expect(isToolDenied("op", [])).toBe(false);
  });

  it("works with a realistic deny list", () => {
    const denyList = getDefaultDenyList("minimal");
    expect(isToolDenied("op:get-secret", denyList)).toBe(true);
    expect(isToolDenied("bw:unlock", denyList)).toBe(true);
    expect(isToolDenied("shell:sudo", denyList)).toBe(true);
    expect(isToolDenied("git:commit", denyList)).toBe(false);
  });
});
