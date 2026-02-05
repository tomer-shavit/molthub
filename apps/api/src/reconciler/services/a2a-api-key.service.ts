import * as crypto from "crypto";
import { Injectable, Inject, Logger } from "@nestjs/common";
import { PRISMA_CLIENT } from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import type { IA2aApiKeyService } from "../interfaces/a2a-api-key.interface";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELEGATION_LABEL = "clawster-delegation-auto";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * A2aApiKeyService — manages A2A (agent-to-agent) API keys.
 *
 * Single Responsibility: Generate, rotate, and revoke API keys used for
 * inter-bot communication (delegation).
 *
 * Extracted from DelegationSkillWriterService to follow SRP.
 */
@Injectable()
export class A2aApiKeyService implements IA2aApiKeyService {
  private readonly logger = new Logger(A2aApiKeyService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  /**
   * Ensure a delegation API key exists for a bot instance.
   * Revokes any previous delegation keys and generates a fresh one.
   *
   * @param botInstanceId - The bot instance ID
   * @returns The plaintext API key (only returned once)
   */
  async ensureDelegationApiKey(botInstanceId: string): Promise<string> {
    // Revoke any previous delegation keys
    await this.revokeApiKeys(botInstanceId, DELEGATION_LABEL);

    // Generate new key
    return this.generateApiKey(botInstanceId, DELEGATION_LABEL);
  }

  /**
   * Generate a new API key for a bot instance with a given label.
   *
   * @param botInstanceId - The bot instance ID
   * @param label - A label to identify the key's purpose
   * @returns The plaintext API key (only returned once)
   */
  async generateApiKey(botInstanceId: string, label: string): Promise<string> {
    const randomBytes = crypto.randomBytes(32);
    const encoded = randomBytes.toString("base64url").replace(/[=]/g, "");
    const key = `mh_a2a_${encoded}`;
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const keyPrefix = key.slice(0, 12) + "...";

    await this.prisma.a2aApiKey.create({
      data: {
        keyHash,
        keyPrefix,
        label,
        botInstanceId,
      },
    });

    this.logger.debug(`Generated API key ${keyPrefix} for bot ${botInstanceId} (label: ${label})`);

    return key;
  }

  /**
   * Revoke all active API keys with a given label for a bot instance.
   *
   * @param botInstanceId - The bot instance ID
   * @param label - The label of keys to revoke
   * @returns The number of keys revoked
   */
  async revokeApiKeys(botInstanceId: string, label: string): Promise<number> {
    const result = await this.prisma.a2aApiKey.updateMany({
      where: {
        botInstanceId,
        label,
        isActive: true,
      },
      data: { isActive: false },
    });

    if (result.count > 0) {
      this.logger.debug(`Revoked ${result.count} API key(s) for bot ${botInstanceId} (label: ${label})`);
    }

    return result.count;
  }
}
