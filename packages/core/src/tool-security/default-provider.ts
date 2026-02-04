/**
 * Default Tool Pattern Provider (DIP)
 *
 * Default implementation of IToolPatternProvider with built-in security patterns.
 */

import type { IToolPatternProvider, ToolPattern } from "./interfaces";
import { ToolPatternCategories } from "./interfaces";

/**
 * Default tool pattern provider with built-in security patterns.
 * Implements the same behavior as the original tool-security.ts module.
 */
export class DefaultToolPatternProvider implements IToolPatternProvider {
  readonly id = "default";

  private readonly dangerousPatterns: ToolPattern[] = [
    // Password manager CLIs
    {
      pattern: "op",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "1Password CLI - base command",
      severity: "critical",
    },
    {
      pattern: "op:*",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "1Password CLI - all commands",
      severity: "critical",
    },
    {
      pattern: "bw",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "Bitwarden CLI - base command",
      severity: "critical",
    },
    {
      pattern: "bw:*",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "Bitwarden CLI - all commands",
      severity: "critical",
    },
    {
      pattern: "lpass",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "LastPass CLI - base command",
      severity: "critical",
    },
    {
      pattern: "lpass:*",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "LastPass CLI - all commands",
      severity: "critical",
    },
    {
      pattern: "keepassxc-cli",
      category: ToolPatternCategories.PASSWORD_MANAGER,
      description: "KeePassXC CLI",
      severity: "critical",
    },

    // OS credential stores
    {
      pattern: "security",
      category: ToolPatternCategories.CREDENTIAL_STORE,
      description: "macOS Keychain CLI - base command",
      severity: "critical",
    },
    {
      pattern: "security:*",
      category: ToolPatternCategories.CREDENTIAL_STORE,
      description: "macOS Keychain CLI - all commands",
      severity: "critical",
    },
    {
      pattern: "secret-tool",
      category: ToolPatternCategories.CREDENTIAL_STORE,
      description: "Linux Secret Service CLI - base command",
      severity: "critical",
    },
    {
      pattern: "secret-tool:*",
      category: ToolPatternCategories.CREDENTIAL_STORE,
      description: "Linux Secret Service CLI - all commands",
      severity: "critical",
    },

    // Browser credential access
    {
      pattern: "browser:password-*",
      category: ToolPatternCategories.BROWSER_CREDENTIAL,
      description: "Browser password extraction tools",
      severity: "critical",
    },
    {
      pattern: "browser:autofill-*",
      category: ToolPatternCategories.BROWSER_CREDENTIAL,
      description: "Browser autofill data extraction tools",
      severity: "critical",
    },
  ];

  private readonly elevatedOnlyTools: string[] = [
    "shell:sudo",
    "shell:su",
    "docker:exec",
    "docker:run",
    "system:reboot",
    "system:shutdown",
    "system:service-restart",
  ];

  /**
   * Get all dangerous tool patterns with metadata.
   */
  getDangerousPatterns(): ToolPattern[] {
    return [...this.dangerousPatterns];
  }

  /**
   * Get all elevated-only tool identifiers.
   */
  getElevatedOnlyTools(): string[] {
    return [...this.elevatedOnlyTools];
  }

  /**
   * Get the default deny list for a given tool profile.
   */
  getDenyListForProfile(profile: string): string[] {
    const base = this.dangerousPatterns.map((p) => p.pattern);

    switch (profile) {
      case "minimal":
        return [...base, ...this.elevatedOnlyTools];
      case "coding":
        // Coding profile allows docker:exec and docker:run
        return [...base, ...this.elevatedOnlyTools.filter((t) => t !== "docker:exec" && t !== "docker:run")];
      case "messaging":
        return [...base, ...this.elevatedOnlyTools];
      case "full":
        // "full" profile still blocks dangerous tools but allows elevated
        return [...base];
      default:
        return [...base, ...this.elevatedOnlyTools];
    }
  }

  /**
   * Check if a tool reference matches any pattern in a deny list.
   */
  isToolDenied(toolRef: string, denyList: string[]): boolean {
    for (const pattern of denyList) {
      if (pattern === toolRef) return true;
      if (pattern.endsWith(":*")) {
        const prefix = pattern.slice(0, -1); // "op:*" -> "op:"
        if (toolRef.startsWith(prefix) || toolRef === pattern.slice(0, -2)) return true;
      }
    }
    return false;
  }
}

/**
 * Default singleton instance of the tool pattern provider.
 */
export const defaultToolPatternProvider = new DefaultToolPatternProvider();
