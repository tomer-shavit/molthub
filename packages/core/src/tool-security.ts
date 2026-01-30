/**
 * Tool security constants and utilities.
 *
 * Defines patterns for dangerous tools that should be denied by default
 * and tools that require elevated permissions.
 */

/** Tools that are always blocked unless explicitly overridden. */
export const DANGEROUS_TOOL_PATTERNS: string[] = [
  // Password manager CLIs
  "op",
  "op:*",
  "bw",
  "bw:*",
  "lpass",
  "lpass:*",
  "keepassxc-cli",
  // OS credential stores
  "security",
  "security:*",
  "secret-tool",
  "secret-tool:*",
  // Browser credential access
  "browser:password-*",
  "browser:autofill-*",
];

/** Tools that require elevated permissions to use. */
export const ELEVATED_ONLY_TOOLS: string[] = [
  "shell:sudo",
  "shell:su",
  "docker:exec",
  "docker:run",
  "system:reboot",
  "system:shutdown",
  "system:service-restart",
];

/**
 * Returns the default deny list for a given tool profile.
 * More restrictive profiles get longer deny lists.
 */
export function getDefaultDenyList(profile: string): string[] {
  const base = [...DANGEROUS_TOOL_PATTERNS];

  switch (profile) {
    case "minimal":
      return [...base, ...ELEVATED_ONLY_TOOLS];
    case "coding":
      return [...base, ...ELEVATED_ONLY_TOOLS.filter(t => t !== "docker:exec" && t !== "docker:run")];
    case "messaging":
      return [...base, ...ELEVATED_ONLY_TOOLS];
    case "full":
      // "full" profile still blocks dangerous tools but allows elevated
      return [...base];
    default:
      return [...base, ...ELEVATED_ONLY_TOOLS];
  }
}

/**
 * Check if a tool reference matches any pattern in a deny list.
 * Supports exact matches and wildcard patterns (e.g., "op:*" matches "op:get", "op:list").
 */
export function isToolDenied(toolRef: string, denyList: string[]): boolean {
  for (const pattern of denyList) {
    if (pattern === toolRef) return true;
    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -1); // "op:*" -> "op:"
      if (toolRef.startsWith(prefix) || toolRef === pattern.slice(0, -2)) return true;
    }
  }
  return false;
}
