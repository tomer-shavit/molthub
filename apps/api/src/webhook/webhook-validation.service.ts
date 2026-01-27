import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

@Injectable()
export class WebhookValidationService {
  /**
   * Validate webhook signature using HMAC-SHA256
   * Supports multiple signature formats:
   * - x-hub-signature-256 (GitHub style)
   * - x-signature (Generic)
   * - x-slack-signature (Slack style)
   */
  validateSignature(
    payload: string,
    signature: string,
    secret: string,
    options?: {
      algorithm?: "sha256" | "sha1";
      signaturePrefix?: string;
    }
  ): WebhookValidationResult {
    const algorithm = options?.algorithm || "sha256";
    const prefix = options?.signaturePrefix || "sha256=";

    // Remove prefix if present
    const actualSignature = signature.startsWith(prefix) 
      ? signature.slice(prefix.length) 
      : signature;

    const expectedSignature = createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    try {
      const actualBuffer = Buffer.from(actualSignature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (actualBuffer.length !== expectedBuffer.length) {
        return { valid: false, error: "Invalid signature length" };
      }

      const match = timingSafeEqual(actualBuffer, expectedBuffer);

      if (!match) {
        return { valid: false, error: "Signature mismatch" };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid signature format" };
    }
  }

  /**
   * Validate Slack webhook signature
   * Format: v0=timestamp.payload_hash
   */
  validateSlackSignature(
    body: string,
    signature: string,
    timestamp: string,
    secret: string
  ): WebhookValidationResult {
    // Check timestamp is recent (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    
    if (Math.abs(now - requestTime) > 300) {
      return { valid: false, error: "Request timestamp too old" };
    }

    const basestring = `v0:${timestamp}:${body}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(basestring)
      .digest("hex");

    const fullExpected = `v0=${expectedSignature}`;

    try {
      const match = timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(fullExpected)
      );

      if (!match) {
        return { valid: false, error: "Signature mismatch" };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid signature format" };
    }
  }

  /**
   * Generate a secure webhook secret
   */
  generateSecret(): string {
    const bytes = new Uint8Array(32);
    require("crypto").randomFillSync(bytes);
    return Buffer.from(bytes).toString("hex");
  }
}