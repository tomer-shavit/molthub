import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@molthub/database";
import * as crypto from "crypto";

@Injectable()
export class A2aApiKeyService {
  private readonly logger = new Logger(A2aApiKeyService.name);

  /**
   * Generate a new API key for a bot instance.
   * Returns the plaintext key once — it is never stored.
   */
  async generate(
    botInstanceId: string,
    label?: string,
  ): Promise<{ key: string; id: string }> {
    const randomBytes = crypto.randomBytes(32);
    const encoded = randomBytes
      .toString("base64url")
      .replace(/[=]/g, "");
    const key = `mh_a2a_${encoded}`;

    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const keyPrefix = key.slice(0, 12) + "...";

    const record = await prisma.a2aApiKey.create({
      data: {
        keyHash,
        keyPrefix,
        label: label || null,
        botInstanceId,
      },
    });

    this.logger.log(
      `Generated API key ${keyPrefix} for bot ${botInstanceId}`,
    );

    return { key, id: record.id };
  }

  /**
   * Validate an API key for a specific bot instance.
   * Returns true if valid, false otherwise.
   */
  async validate(botInstanceId: string, key: string): Promise<boolean> {
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const record = await prisma.a2aApiKey.findFirst({
      where: {
        keyHash,
        botInstanceId,
        isActive: true,
      },
    });

    if (!record) return false;

    // Check expiration
    if (record.expiresAt && record.expiresAt < new Date()) {
      return false;
    }

    // Update last used timestamp (fire-and-forget)
    prisma.a2aApiKey
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return true;
  }

  /**
   * List all API keys for a bot instance (no hashes returned).
   */
  async list(botInstanceId: string) {
    return prisma.a2aApiKey.findMany({
      where: { botInstanceId },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Revoke an API key by setting isActive to false.
   */
  async revoke(keyId: string): Promise<void> {
    await prisma.a2aApiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
    this.logger.log(`Revoked API key ${keyId}`);
  }
}
