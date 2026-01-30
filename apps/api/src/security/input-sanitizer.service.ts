import { Injectable, Logger } from "@nestjs/common";
import { detectInjections, InjectionPattern } from "./injection-patterns";

export interface InputContext {
  source: "discord" | "slack" | "telegram" | "whatsapp" | "email" | "web" | "api" | "document";
  channelId?: string;
  userId?: string;
  isDirectMessage: boolean;
}

export interface InjectionFlag {
  patternId: string;
  patternName: string;
  severity: "low" | "medium" | "high";
  position: number;
  description: string;
}

export interface SanitizedInput {
  original: string;
  sanitized: string;
  flagged: boolean;
  flags: InjectionFlag[];
}

@Injectable()
export class InputSanitizerService {
  private readonly logger = new Logger(InputSanitizerService.name);

  /**
   * Sanitize user input by detecting injection patterns and stripping hidden characters.
   */
  sanitizeUserInput(input: string, context: InputContext): SanitizedInput {
    const cleaned = this.stripHiddenCharacters(input);
    const detections = detectInjections(cleaned);

    const flags: InjectionFlag[] = detections.map((d) => ({
      patternId: d.id,
      patternName: d.name,
      severity: d.severity,
      position: cleaned.search(d.pattern),
      description: d.description,
    }));

    if (flags.length > 0) {
      this.logger.warn(
        `Injection patterns detected in ${context.source} input from user ${context.userId ?? "unknown"}: ` +
        flags.map((f) => `${f.patternId} (${f.severity})`).join(", "),
      );
    }

    return {
      original: input,
      sanitized: cleaned,
      flagged: flags.length > 0,
      flags,
    };
  }

  /**
   * Detect injection patterns in content without sanitizing.
   */
  detectInjectionPatterns(content: string): { detected: boolean; patterns: InjectionPattern[] } {
    const patterns = detectInjections(content);
    return { detected: patterns.length > 0, patterns };
  }

  /**
   * Strip zero-width and invisible Unicode characters used to hide injections.
   */
  stripHiddenCharacters(input: string): string {
    // Remove zero-width characters
    return input.replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD\u034F\u061C\u180E]/g, "");
  }

  /**
   * Sanitize a URL to prevent SSRF attacks.
   * Blocks internal/private network addresses.
   */
  sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // Block private/internal addresses
      const blocked = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\./,
        /^::1$/,
        /^fc00:/i,
        /^fe80:/i,
        /\.internal$/i,
        /\.local$/i,
      ];

      for (const pattern of blocked) {
        if (pattern.test(hostname)) {
          this.logger.warn(`Blocked SSRF attempt to internal address: ${hostname}`);
          throw new Error(`URL points to a blocked internal address: ${hostname}`);
        }
      }

      return url;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid URL: ${url}`);
      }
      throw error;
    }
  }
}
