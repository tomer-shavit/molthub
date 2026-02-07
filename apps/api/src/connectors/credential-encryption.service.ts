import { Injectable, Logger } from "@nestjs/common";
import { encryptBuffer, decryptBuffer } from "@clawster/core";

const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

@Injectable()
export class CredentialEncryptionService {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private readonly encryptionKey: string | null;

  constructor() {
    const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (key && HEX_KEY_REGEX.test(key)) {
      this.encryptionKey = key;
      this.logger.log("Credential encryption key loaded");
    } else {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "CREDENTIAL_ENCRYPTION_KEY is required in production (expected 64 hex chars).",
        );
      }
      this.encryptionKey = null;
      this.logger.warn(
        "CREDENTIAL_ENCRYPTION_KEY is missing or invalid (expected 64 hex chars). " +
          "Credentials will be stored with base64 encoding only (no encryption). " +
          "Set CREDENTIAL_ENCRYPTION_KEY for production use.",
      );
    }
  }

  /**
   * Encrypt a plain object into a base64 string.
   * Falls back to plain base64 encoding if no encryption key is configured.
   */
  encrypt(plainObject: Record<string, unknown>): string {
    const jsonBuf = Buffer.from(JSON.stringify(plainObject), "utf-8");

    if (!this.encryptionKey) {
      return jsonBuf.toString("base64");
    }

    const encrypted = encryptBuffer(jsonBuf, this.encryptionKey);
    return encrypted.toString("base64");
  }

  /**
   * Decrypt a base64 string back into a plain object.
   * Falls back to plain base64 decoding if no encryption key is configured.
   */
  decrypt(encryptedBase64: string): Record<string, unknown> {
    const buf = Buffer.from(encryptedBase64, "base64");

    if (!this.encryptionKey) {
      return JSON.parse(buf.toString("utf-8"));
    }

    const decrypted = decryptBuffer(buf, this.encryptionKey);
    return JSON.parse(decrypted.toString("utf-8"));
  }

  /**
   * Return a masked version of credential config suitable for display.
   * Sensitive values are replaced with partial reveals.
   */
  mask(
    type: string,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (type) {
      case "aws-account":
        return {
          accessKeyId: this.maskString(
            config.accessKeyId as string | undefined,
            4,
            4,
          ),
          secretAccessKey: "••••••••",
          region: config.region,
          accountId: config.accountId,
        };

      case "azure-account":
        return {
          subscriptionId: this.maskString(config.subscriptionId as string | undefined, 4, 4),
          resourceGroup: config.resourceGroup,
          region: config.region,
          tenantId: this.maskString(config.tenantId as string | undefined, 4, 4),
          clientId: this.maskString(config.clientId as string | undefined, 4, 4),
          clientSecret: "••••••••",
        };

      case "gce-account":
        return {
          projectId: config.projectId,
          zone: config.zone,
          keyFilePath: config.keyFilePath ? this.maskString(config.keyFilePath as string | undefined, 6, 6) : undefined,
        };

      case "api-key":
        return {
          provider: config.provider,
          apiKey: this.maskString(config.apiKey as string | undefined, 6, 4),
        };

      default:
        return Object.fromEntries(
          Object.entries(config).map(([k, v]) => [
            k,
            typeof v === "string" ? this.maskString(v, 2, 2) : v,
          ]),
        );
    }
  }

  /**
   * Show the first `showFirst` and last `showLast` characters of a string,
   * replacing the middle with "••••". If the string is too short, returns "••••".
   */
  private maskString(
    val: string | undefined,
    showFirst: number,
    showLast: number,
  ): string {
    if (!val || val.length <= showFirst + showLast) {
      return "••••";
    }
    return (
      val.slice(0, showFirst) + "••••" + val.slice(val.length - showLast)
    );
  }
}
