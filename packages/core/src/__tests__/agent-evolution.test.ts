import {
  computeEvolutionDiff,
  extractSkills,
  extractMcpServers,
  extractEnabledChannels,
  extractToolProfile,
  diffArrays,
  summarizeEvolution,
} from "../agent-evolution";

describe("agent-evolution", () => {
  describe("extractSkills", () => {
    it("returns empty array for null/undefined config", () => {
      expect(extractSkills(null as any)).toEqual([]);
      expect(extractSkills(undefined as any)).toEqual([]);
      expect(extractSkills({})).toEqual([]);
    });

    it("extracts skills from entries keys", () => {
      const config = {
        skills: {
          entries: {
            github: { enabled: true },
            jira: { enabled: true },
          },
        },
      };
      expect(extractSkills(config)).toEqual(["github", "jira"]);
    });

    it("extracts skills from allowBundled", () => {
      const config = {
        skills: {
          allowBundled: ["github", "slack"],
        },
      };
      expect(extractSkills(config)).toEqual(["github", "slack"]);
    });

    it("deduplicates and sorts skills", () => {
      const config = {
        skills: {
          entries: { github: {}, jira: {} },
          allowBundled: ["github", "slack"],
        },
      };
      const result = extractSkills(config);
      expect(result).toEqual(["github", "jira", "slack"]);
    });
  });

  describe("extractEnabledChannels", () => {
    it("returns empty array for missing channels", () => {
      expect(extractEnabledChannels({})).toEqual([]);
    });

    it("returns enabled channels", () => {
      const config = {
        channels: {
          whatsapp: { enabled: true },
          telegram: { enabled: false },
          discord: {},
        },
      };
      expect(extractEnabledChannels(config)).toEqual(["discord", "whatsapp"]);
    });
  });

  describe("extractToolProfile", () => {
    it("returns empty profile for missing tools", () => {
      const result = extractToolProfile({});
      expect(result.profile).toBeUndefined();
      expect(result.allow).toBeUndefined();
      expect(result.deny).toBeUndefined();
    });

    it("extracts tool profile, allow, and deny", () => {
      const config = {
        tools: {
          profile: "coding",
          allow: ["group:fs", "group:runtime"],
          deny: ["group:web"],
        },
      };
      const result = extractToolProfile(config);
      expect(result.profile).toBe("coding");
      expect(result.allow).toEqual(["group:fs", "group:runtime"]);
      expect(result.deny).toEqual(["group:web"]);
    });
  });

  describe("diffArrays", () => {
    it("returns empty for identical arrays", () => {
      const result = diffArrays(["a", "b"], ["a", "b"]);
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
    });

    it("detects added items", () => {
      const result = diffArrays(["a"], ["a", "b", "c"]);
      expect(result.added).toEqual(["b", "c"]);
      expect(result.removed).toEqual([]);
    });

    it("detects removed items", () => {
      const result = diffArrays(["a", "b", "c"], ["a"]);
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual(["b", "c"]);
    });

    it("detects both added and removed", () => {
      const result = diffArrays(["a", "b"], ["b", "c"]);
      expect(result.added).toEqual(["c"]);
      expect(result.removed).toEqual(["a"]);
    });
  });

  describe("computeEvolutionDiff", () => {
    it("returns no changes for identical configs", () => {
      const config = {
        skills: { entries: { github: {} } },
        channels: { whatsapp: { enabled: true } },
        tools: { profile: "coding" },
      };
      const result = computeEvolutionDiff(config, { ...config });
      expect(result.hasEvolved).toBe(false);
      expect(result.totalChanges).toBe(0);
      expect(result.changes).toEqual([]);
    });

    it("detects added skills", () => {
      const deployed = { skills: { entries: { github: {} } } };
      const live = { skills: { entries: { github: {}, jira: {} } } };
      const result = computeEvolutionDiff(deployed, live);
      expect(result.hasEvolved).toBe(true);
      expect(result.changes).toContainEqual(
        expect.objectContaining({
          category: "skills",
          field: "jira",
          changeType: "added",
        }),
      );
    });

    it("detects removed skills", () => {
      const deployed = { skills: { entries: { github: {}, jira: {} } } };
      const live = { skills: { entries: { github: {} } } };
      const result = computeEvolutionDiff(deployed, live);
      expect(result.hasEvolved).toBe(true);
      expect(result.changes).toContainEqual(
        expect.objectContaining({
          category: "skills",
          field: "jira",
          changeType: "removed",
        }),
      );
    });

    it("detects channel changes", () => {
      const deployed = { channels: { whatsapp: { enabled: true } } };
      const live = { channels: { whatsapp: { enabled: true }, telegram: { enabled: true } } };
      const result = computeEvolutionDiff(deployed, live);
      expect(result.hasEvolved).toBe(true);
      expect(result.changes).toContainEqual(
        expect.objectContaining({
          category: "channels",
          field: "telegram",
          changeType: "added",
        }),
      );
    });

    it("detects tool profile changes", () => {
      const deployed = { tools: { profile: "minimal" } };
      const live = { tools: { profile: "coding" } };
      const result = computeEvolutionDiff(deployed, live);
      expect(result.hasEvolved).toBe(true);
      expect(result.changes).toContainEqual(
        expect.objectContaining({
          category: "tools",
          changeType: "modified",
        }),
      );
    });

    it("handles empty configs gracefully", () => {
      const result = computeEvolutionDiff({}, {});
      expect(result.hasEvolved).toBe(false);
      expect(result.totalChanges).toBe(0);
    });

    it("handles null-like configs gracefully", () => {
      const result = computeEvolutionDiff(null as any, null as any);
      expect(result.hasEvolved).toBe(false);
    });
  });

  describe("summarizeEvolution", () => {
    it("summarizes no changes", () => {
      const diff = { changes: [], hasEvolved: false, totalChanges: 0 };
      const summary = summarizeEvolution(diff);
      expect(summary.hasEvolved).toBe(false);
      expect(summary.totalChanges).toBe(0);
      expect(summary.changedCategories).toEqual([]);
    });

    it("summarizes changes by category", () => {
      const diff = {
        changes: [
          { category: "skills", field: "jira", changeType: "added" as const },
          { category: "skills", field: "github", changeType: "removed" as const },
          { category: "channels", field: "telegram", changeType: "added" as const },
        ],
        hasEvolved: true,
        totalChanges: 3,
      };
      const summary = summarizeEvolution(diff);
      expect(summary.hasEvolved).toBe(true);
      expect(summary.totalChanges).toBe(3);
      expect(summary.categoryCounts).toEqual({ skills: 2, channels: 1 });
      expect(summary.changedCategories.sort()).toEqual(["channels", "skills"]);
    });
  });
});
