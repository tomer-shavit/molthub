/**
 * Tool Security Interfaces (DIP)
 *
 * Defines injectable interfaces for tool security patterns
 * following the Dependency Inversion Principle.
 */

/**
 * Represents a dangerous tool pattern with metadata.
 */
export interface ToolPattern {
  /** The pattern to match (e.g., "op", "op:*", "browser:password-*") */
  pattern: string;
  /** Category for grouping patterns (e.g., "password-manager", "credential-store") */
  category: string;
  /** Human-readable description of what this pattern matches */
  description: string;
  /** Severity level for violations */
  severity: "critical" | "high" | "medium";
}

/**
 * Interface for tool security pattern providers.
 * Implement this interface to provide custom tool security patterns.
 */
export interface IToolPatternProvider {
  /** Unique identifier for this provider */
  readonly id: string;

  /**
   * Get all dangerous tool patterns.
   * These are tools that should be blocked unless explicitly overridden.
   *
   * @returns Array of dangerous tool patterns with metadata
   */
  getDangerousPatterns(): ToolPattern[];

  /**
   * Get tools that require elevated permissions.
   * These tools are allowed but require special authorization.
   *
   * @returns Array of elevated-only tool identifiers
   */
  getElevatedOnlyTools(): string[];

  /**
   * Get the default deny list for a given tool profile.
   * More restrictive profiles get longer deny lists.
   *
   * @param profile - The tool profile (e.g., "minimal", "coding", "full")
   * @returns Array of tool patterns to deny
   */
  getDenyListForProfile(profile: string): string[];

  /**
   * Check if a tool reference matches any pattern in a deny list.
   * Supports exact matches and wildcard patterns (e.g., "op:*" matches "op:get").
   *
   * @param toolRef - The tool reference to check
   * @param denyList - The list of patterns to check against
   * @returns True if the tool is denied
   */
  isToolDenied(toolRef: string, denyList: string[]): boolean;
}

/**
 * Tool pattern categories for organizing patterns.
 */
export const ToolPatternCategories = {
  PASSWORD_MANAGER: "password-manager",
  CREDENTIAL_STORE: "credential-store",
  BROWSER_CREDENTIAL: "browser-credential",
  SYSTEM_ELEVATED: "system-elevated",
  DOCKER_ELEVATED: "docker-elevated",
} as const;

export type ToolPatternCategory = typeof ToolPatternCategories[keyof typeof ToolPatternCategories];
