/**
 * Tool Security Module
 *
 * Exports interfaces, providers, and registry for tool security.
 * Follows Dependency Inversion Principle (DIP).
 */

// Interfaces
export type {
  ToolPattern,
  IToolPatternProvider,
  ToolPatternCategory,
} from "./interfaces";

export { ToolPatternCategories } from "./interfaces";

// Default provider
export {
  DefaultToolPatternProvider,
  defaultToolPatternProvider,
} from "./default-provider";

// Registry
export {
  ToolPatternProviderRegistry,
  toolPatternRegistry,
} from "./registry";

// ── Legacy Compatibility Exports ─────────────────────────────────────────
// These are re-exported for backward compatibility with the original API.

import { defaultToolPatternProvider } from "./default-provider";
import { toolPatternRegistry } from "./registry";

/**
 * Tools that are always blocked unless explicitly overridden.
 * @deprecated Import from tool-security module instead and use getDangerousPatterns()
 */
export const DANGEROUS_TOOL_PATTERNS: string[] = defaultToolPatternProvider
  .getDangerousPatterns()
  .map((p) => p.pattern);

/**
 * Tools that require elevated permissions to use.
 * @deprecated Import from tool-security module instead and use getElevatedOnlyTools()
 */
export const ELEVATED_ONLY_TOOLS: string[] = defaultToolPatternProvider.getElevatedOnlyTools();

/**
 * Returns the default deny list for a given tool profile.
 * @deprecated Import from tool-security module instead and use getDenyListForProfile()
 */
export function getDefaultDenyList(profile: string): string[] {
  return defaultToolPatternProvider.getDenyListForProfile(profile);
}

/**
 * Check if a tool reference matches any pattern in a deny list.
 * @deprecated Import from tool-security module instead and use toolPatternRegistry.isToolDenied()
 */
export function isToolDenied(toolRef: string, denyList: string[]): boolean {
  return toolPatternRegistry.isToolDenied(toolRef, denyList);
}
