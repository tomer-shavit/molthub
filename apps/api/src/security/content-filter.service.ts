import { Injectable, Logger } from "@nestjs/common";
import { InputSanitizerService, InputContext, SanitizedInput } from "./input-sanitizer.service";

export interface IncomingMessage {
  content: string;
  source: InputContext["source"];
  channelId?: string;
  userId?: string;
  isDirectMessage: boolean;
}

export interface FilteredMessage {
  content: string;
  blocked: boolean;
  flagged: boolean;
  flags: SanitizedInput["flags"];
}

export interface FilteredDocument {
  content: string;
  blocked: boolean;
  flagged: boolean;
  flags: SanitizedInput["flags"];
  mimeType: string;
}

export type ContentFilterMode = "off" | "log" | "block";

@Injectable()
export class ContentFilterService {
  private readonly logger = new Logger(ContentFilterService.name);
  private mode: ContentFilterMode = "log";

  constructor(private readonly sanitizer: InputSanitizerService) {}

  setMode(mode: ContentFilterMode): void {
    this.mode = mode;
  }

  /**
   * Filter an incoming message through the injection detection pipeline.
   */
  async filterIncoming(message: IncomingMessage): Promise<FilteredMessage> {
    if (this.mode === "off") {
      return { content: message.content, blocked: false, flagged: false, flags: [] };
    }

    const context: InputContext = {
      source: message.source,
      channelId: message.channelId,
      userId: message.userId,
      isDirectMessage: message.isDirectMessage,
    };

    const result = this.sanitizer.sanitizeUserInput(message.content, context);

    const hasHighSeverity = result.flags.some((f) => f.severity === "high");
    const shouldBlock = this.mode === "block" && hasHighSeverity;

    if (shouldBlock) {
      this.logger.warn(
        `Blocked message from ${message.source}/${message.userId}: high-severity injection detected`,
      );
    }

    return {
      content: shouldBlock ? "[Content blocked by security filter]" : result.sanitized,
      blocked: shouldBlock,
      flagged: result.flagged,
      flags: result.flags,
    };
  }

  /**
   * Filter document content (PDFs, emails, web pages).
   */
  async filterDocument(content: string, mimeType: string): Promise<FilteredDocument> {
    if (this.mode === "off") {
      return { content, blocked: false, flagged: false, flags: [], mimeType };
    }

    const context: InputContext = {
      source: "document",
      isDirectMessage: false,
    };

    const result = this.sanitizer.sanitizeUserInput(content, context);

    const hasHighSeverity = result.flags.some((f) => f.severity === "high");
    const shouldBlock = this.mode === "block" && hasHighSeverity;

    return {
      content: shouldBlock ? "[Document content blocked by security filter]" : result.sanitized,
      blocked: shouldBlock,
      flagged: result.flagged,
      flags: result.flags,
      mimeType,
    };
  }
}
