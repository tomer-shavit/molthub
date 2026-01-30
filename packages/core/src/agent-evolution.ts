export type EvolutionChangeType = "added" | "removed" | "modified";

export interface EvolutionChange {
  category: "skills" | "tools" | "channels" | "mcpServers" | "config";
  field: string;
  changeType: EvolutionChangeType;
  deployedValue?: unknown;
  liveValue?: unknown;
}

export interface AgentEvolutionDiff {
  changes: EvolutionChange[];
  hasEvolved: boolean;
  totalChanges: number;
}

export interface EvolutionSummary {
  hasEvolved: boolean;
  totalChanges: number;
  categoryCounts: Record<string, number>;
  changedCategories: string[];
}

export interface ToolProfileState {
  profile?: string;
  allow?: string[];
  deny?: string[];
}

export function extractSkills(
  config: Record<string, unknown>,
): string[] {
  if (!config) return [];

  const skills = config.skills as Record<string, unknown> | undefined;
  if (!skills) return [];

  const names = new Set<string>();

  const entries = skills.entries as Record<string, unknown> | undefined;
  if (entries && typeof entries === "object") {
    for (const key of Object.keys(entries)) {
      names.add(key);
    }
  }

  const allowBundled = skills.allowBundled as string[] | undefined;
  if (Array.isArray(allowBundled)) {
    for (const name of allowBundled) {
      if (typeof name === "string") {
        names.add(name);
      }
    }
  }

  return Array.from(names).sort();
}

export function extractMcpServers(
  config: Record<string, unknown>,
): string[] {
  if (!config) return [];

  const servers = new Set<string>();

  const skills = config.skills as Record<string, unknown> | undefined;
  if (skills) {
    const entries = skills.entries as Record<string, unknown> | undefined;
    if (entries && typeof entries === "object") {
      for (const [key, value] of Object.entries(entries)) {
        if (!value || typeof value !== "object") continue;
        const entry = value as Record<string, unknown>;
        if (
          entry.mcpServers !== undefined ||
          entry.mcp !== undefined ||
          entry.type === "mcp"
        ) {
          servers.add(key);
        }
      }
    }
  }

  const plugins = config.plugins as Record<string, unknown> | undefined;
  if (plugins) {
    const pluginEntries = plugins.entries as
      | Record<string, unknown>
      | undefined;
    if (pluginEntries && typeof pluginEntries === "object") {
      for (const [key, value] of Object.entries(pluginEntries)) {
        if (!value || typeof value !== "object") continue;
        const entry = value as Record<string, unknown>;
        if (
          entry.mcpServers !== undefined ||
          entry.mcp !== undefined ||
          entry.type === "mcp"
        ) {
          servers.add(key);
        }
      }
    }
  }

  return Array.from(servers).sort();
}

export function extractEnabledChannels(
  config: Record<string, unknown>,
): string[] {
  if (!config) return [];

  const channels = config.channels as Record<string, unknown> | undefined;
  if (!channels || typeof channels !== "object") return [];

  const enabled: string[] = [];
  for (const [key, value] of Object.entries(channels)) {
    if (value && typeof value === "object") {
      const ch = value as Record<string, unknown>;
      if (ch.enabled !== false) {
        enabled.push(key);
      }
    } else if (value !== false) {
      enabled.push(key);
    }
  }

  return enabled.sort();
}

export function extractToolProfile(
  config: Record<string, unknown>,
): ToolProfileState {
  if (!config) return {};

  const tools = config.tools as Record<string, unknown> | undefined;
  if (!tools || typeof tools !== "object") return {};

  const result: ToolProfileState = {};

  if (typeof tools.profile === "string") {
    result.profile = tools.profile;
  }

  if (Array.isArray(tools.allow)) {
    result.allow = tools.allow.filter(
      (item): item is string => typeof item === "string",
    );
  }

  if (Array.isArray(tools.deny)) {
    result.deny = tools.deny.filter(
      (item): item is string => typeof item === "string",
    );
  }

  return result;
}

export function diffArrays(
  deployed: string[],
  live: string[],
): { added: string[]; removed: string[] } {
  const deployedSet = new Set(deployed ?? []);
  const liveSet = new Set(live ?? []);

  const added = Array.from(liveSet)
    .filter((item) => !deployedSet.has(item))
    .sort();

  const removed = Array.from(deployedSet)
    .filter((item) => !liveSet.has(item))
    .sort();

  return { added, removed };
}

export function computeEvolutionDiff(
  deployedConfig: Record<string, unknown>,
  liveConfig: Record<string, unknown>,
): AgentEvolutionDiff {
  const safe = (
    c: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> => c ?? {};

  const deployed = safe(deployedConfig);
  const live = safe(liveConfig);

  const changes: EvolutionChange[] = [];

  // Diff skills
  const deployedSkills = extractSkills(deployed);
  const liveSkills = extractSkills(live);
  const skillsDiff = diffArrays(deployedSkills, liveSkills);

  for (const skill of skillsDiff.added) {
    changes.push({
      category: "skills",
      field: skill,
      changeType: "added",
      liveValue: skill,
    });
  }
  for (const skill of skillsDiff.removed) {
    changes.push({
      category: "skills",
      field: skill,
      changeType: "removed",
      deployedValue: skill,
    });
  }

  // Diff MCP servers
  const deployedMcp = extractMcpServers(deployed);
  const liveMcp = extractMcpServers(live);
  const mcpDiff = diffArrays(deployedMcp, liveMcp);

  for (const server of mcpDiff.added) {
    changes.push({
      category: "mcpServers",
      field: server,
      changeType: "added",
      liveValue: server,
    });
  }
  for (const server of mcpDiff.removed) {
    changes.push({
      category: "mcpServers",
      field: server,
      changeType: "removed",
      deployedValue: server,
    });
  }

  // Diff channels
  const deployedChannels = extractEnabledChannels(deployed);
  const liveChannels = extractEnabledChannels(live);
  const channelsDiff = diffArrays(deployedChannels, liveChannels);

  for (const channel of channelsDiff.added) {
    changes.push({
      category: "channels",
      field: channel,
      changeType: "added",
      liveValue: channel,
    });
  }
  for (const channel of channelsDiff.removed) {
    changes.push({
      category: "channels",
      field: channel,
      changeType: "removed",
      deployedValue: channel,
    });
  }

  // Diff tool profile
  const deployedTools = extractToolProfile(deployed);
  const liveTools = extractToolProfile(live);

  if (deployedTools.profile !== liveTools.profile) {
    changes.push({
      category: "tools",
      field: "profile",
      changeType: "modified",
      deployedValue: deployedTools.profile,
      liveValue: liveTools.profile,
    });
  }

  if (
    JSON.stringify(deployedTools.allow ?? []) !==
    JSON.stringify(liveTools.allow ?? [])
  ) {
    changes.push({
      category: "tools",
      field: "allow",
      changeType: "modified",
      deployedValue: deployedTools.allow,
      liveValue: liveTools.allow,
    });
  }

  if (
    JSON.stringify(deployedTools.deny ?? []) !==
    JSON.stringify(liveTools.deny ?? [])
  ) {
    changes.push({
      category: "tools",
      field: "deny",
      changeType: "modified",
      deployedValue: deployedTools.deny,
      liveValue: liveTools.deny,
    });
  }

  // Diff top-level config sections (skip skills, tools, channels)
  const handledKeys = new Set(["skills", "tools", "channels"]);
  const allKeys = new Set([
    ...Object.keys(deployed),
    ...Object.keys(live),
  ]);

  for (const key of Array.from(allKeys).sort()) {
    if (handledKeys.has(key)) continue;

    const deployedVal = JSON.stringify(deployed[key] ?? null);
    const liveVal = JSON.stringify(live[key] ?? null);

    if (deployedVal !== liveVal) {
      if (deployed[key] === undefined) {
        changes.push({
          category: "config",
          field: key,
          changeType: "added",
          liveValue: live[key],
        });
      } else if (live[key] === undefined) {
        changes.push({
          category: "config",
          field: key,
          changeType: "removed",
          deployedValue: deployed[key],
        });
      } else {
        changes.push({
          category: "config",
          field: key,
          changeType: "modified",
          deployedValue: deployed[key],
          liveValue: live[key],
        });
      }
    }
  }

  return {
    changes,
    hasEvolved: changes.length > 0,
    totalChanges: changes.length,
  };
}

export function summarizeEvolution(
  diff: AgentEvolutionDiff,
): EvolutionSummary {
  if (!diff || !diff.changes) {
    return {
      hasEvolved: false,
      totalChanges: 0,
      categoryCounts: {},
      changedCategories: [],
    };
  }

  const categoryCounts: Record<string, number> = {};

  for (const change of diff.changes) {
    categoryCounts[change.category] =
      (categoryCounts[change.category] ?? 0) + 1;
  }

  return {
    hasEvolved: diff.hasEvolved,
    totalChanges: diff.totalChanges,
    categoryCounts,
    changedCategories: Object.keys(categoryCounts).sort(),
  };
}
