/**
 * Tool Pattern Provider Registry (DIP)
 *
 * Registry for tool security pattern providers.
 * Allows custom providers to be registered and used.
 */

import type { IToolPatternProvider, ToolPattern } from "./interfaces";
import { defaultToolPatternProvider } from "./default-provider";

/**
 * Registry for tool pattern providers.
 * Supports multiple providers that are merged in priority order.
 */
export class ToolPatternProviderRegistry {
  private readonly providers = new Map<string, IToolPatternProvider>();
  private readonly priorities = new Map<string, number>();
  private readonly defaultProvider: IToolPatternProvider;

  /**
   * Create a new registry.
   *
   * @param defaultProvider - Optional custom default provider.
   *                          If not provided, uses the built-in defaultToolPatternProvider.
   */
  constructor(defaultProvider?: IToolPatternProvider) {
    // Accept injected default or use the built-in one
    this.defaultProvider = defaultProvider ?? defaultToolPatternProvider;
    // Register the default provider with lowest priority
    this.register(this.defaultProvider, 0);
  }

  /**
   * Register a provider with a given priority.
   * Higher priority providers' patterns take precedence.
   *
   * @param provider - The provider to register
   * @param priority - Priority level (higher = more important, default = 100)
   */
  register(provider: IToolPatternProvider, priority = 100): void {
    this.providers.set(provider.id, provider);
    this.priorities.set(provider.id, priority);
  }

  /**
   * Unregister a provider by ID.
   *
   * @param providerId - The ID of the provider to remove
   * @returns True if the provider was removed
   */
  unregister(providerId: string): boolean {
    if (providerId === "default") {
      throw new Error("Cannot unregister the default provider");
    }
    this.priorities.delete(providerId);
    return this.providers.delete(providerId);
  }

  /**
   * Get a provider by ID.
   *
   * @param providerId - The provider ID
   * @returns The provider or undefined
   */
  get(providerId: string): IToolPatternProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all providers sorted by priority (highest first).
   */
  private getSortedProviders(): IToolPatternProvider[] {
    return Array.from(this.providers.entries())
      .sort((a, b) => (this.priorities.get(b[0]) ?? 0) - (this.priorities.get(a[0]) ?? 0))
      .map(([, provider]) => provider);
  }

  /**
   * Get all dangerous patterns from all providers.
   * Patterns are deduplicated by pattern string.
   */
  getAllDangerousPatterns(): ToolPattern[] {
    const seen = new Set<string>();
    const result: ToolPattern[] = [];

    for (const provider of this.getSortedProviders()) {
      for (const pattern of provider.getDangerousPatterns()) {
        if (!seen.has(pattern.pattern)) {
          seen.add(pattern.pattern);
          result.push(pattern);
        }
      }
    }

    return result;
  }

  /**
   * Get all elevated-only tools from all providers.
   */
  getAllElevatedOnlyTools(): string[] {
    const seen = new Set<string>();
    for (const provider of this.getSortedProviders()) {
      for (const tool of provider.getElevatedOnlyTools()) {
        seen.add(tool);
      }
    }
    return Array.from(seen);
  }

  /**
   * Get the deny list for a profile, merging from all providers.
   *
   * @param profile - The tool profile
   * @returns Merged deny list
   */
  getDenyListForProfile(profile: string): string[] {
    const seen = new Set<string>();
    for (const provider of this.getSortedProviders()) {
      for (const pattern of provider.getDenyListForProfile(profile)) {
        seen.add(pattern);
      }
    }
    return Array.from(seen);
  }

  /**
   * Check if a tool is denied using any registered provider.
   * Asks all providers in priority order; if any denies the tool, it's denied.
   *
   * @param toolRef - The tool reference to check
   * @param denyList - The deny list to check against
   * @returns True if any provider denies the tool
   */
  isToolDenied(toolRef: string, denyList: string[]): boolean {
    for (const provider of this.getSortedProviders()) {
      if (provider.isToolDenied(toolRef, denyList)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all registered provider IDs.
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Reset the registry to only the default provider.
   */
  reset(): void {
    this.providers.clear();
    this.priorities.clear();
    this.register(this.defaultProvider, 0);
  }
}

/**
 * Default global registry instance.
 */
export const toolPatternRegistry = new ToolPatternProviderRegistry();
