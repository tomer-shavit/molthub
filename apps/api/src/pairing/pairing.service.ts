import { randomInt } from "node:crypto";
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@molthub/database";
import type { PairingState, OpenClawChannelType } from "@molthub/database";
import { GatewayManager } from "@molthub/gateway-client";
import type { GatewayConnectionOptions } from "@molthub/gateway-client";

/** Characters used for pairing codes — excludes ambiguous 0/O/1/I. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_PENDING_PER_CHANNEL = 3;
const PAIRING_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class PairingService {
  private readonly logger = new Logger(PairingService.name);
  private readonly gatewayManager = new GatewayManager();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Verify that the bot instance exists.
   * Throws NotFoundException if the instance does not exist.
   */
  async verifyInstanceExists(instanceId: string): Promise<void> {
    const instance = await prisma.botInstance.findFirst({
      where: { id: instanceId },
      select: { id: true },
    });
    if (!instance) {
      throw new NotFoundException(
        `Bot instance ${instanceId} not found`,
      );
    }
  }

  /**
   * Generate an 8-character pairing code using the safe alphabet.
   */
  private generatePairingCode(): string {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
  }

  /**
   * Get a Gateway client for a bot instance.
   */
  private async getGatewayClient(instanceId: string) {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, gatewayPort: true },
    });

    const gwConn = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    const host = gwConn?.host ?? "localhost";
    const port = gwConn?.port ?? instance?.gatewayPort ?? 18789;
    const token = gwConn?.authToken ?? undefined;

    const options: GatewayConnectionOptions = {
      host,
      port,
      auth: token ? { mode: "token", token } : { mode: "token", token: "molthub" },
      timeoutMs: 10_000,
    };

    return this.gatewayManager.getClient(instanceId, options);
  }

  /**
   * Map an OpenClawChannelType enum (e.g. "WHATSAPP") to a config key (e.g. "whatsapp").
   */
  private channelTypeToConfigKey(channelType: string): string {
    const mapping: Record<string, string> = {
      WHATSAPP: "whatsapp",
      TELEGRAM: "telegram",
      DISCORD: "discord",
      SLACK: "slack",
      SIGNAL: "signal",
      IMESSAGE: "imessage",
      MATTERMOST: "mattermost",
      GOOGLE_CHAT: "google-chat",
      MS_TEAMS: "ms-teams",
      LINE: "line",
      MATRIX: "matrix",
    };
    return mapping[channelType] ?? channelType.toLowerCase();
  }

  /**
   * Sync a pairing approval to the Gateway by adding senderIds to allowFrom.
   * Logs warning on failure but does not throw.
   */
  private async syncApprovalToGateway(
    instanceId: string,
    channelType: string,
    senderIds: string[],
  ): Promise<void> {
    try {
      const client = await this.getGatewayClient(instanceId);
      const configResult = await client.configGet();
      const config = configResult.config as Record<string, unknown>;
      const hash = configResult.hash;

      const channelKey = this.channelTypeToConfigKey(channelType);
      const channels = (config.channels ?? {}) as Record<string, Record<string, unknown>>;
      const channelConfig = channels[channelKey] ?? {};
      const currentAllowFrom = Array.isArray(channelConfig.allowFrom)
        ? (channelConfig.allowFrom as string[])
        : [];

      const updatedAllowFrom = [...new Set([...currentAllowFrom, ...senderIds])];

      await client.configPatch({
        patch: {
          channels: {
            [channelKey]: {
              allowFrom: updatedAllowFrom,
            },
          },
        },
        baseHash: hash,
      });

      this.logger.log(
        `Synced approval to Gateway: instance=${instanceId} channel=${channelKey} added=${senderIds.join(",")}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to sync approval to Gateway for instance=${instanceId}: ${err}`,
      );
    }
  }

  /**
   * Sync a pairing revocation to the Gateway by removing senderId from allowFrom.
   * Logs warning on failure but does not throw.
   */
  private async syncRevocationToGateway(
    instanceId: string,
    channelType: string,
    senderId: string,
  ): Promise<void> {
    try {
      const client = await this.getGatewayClient(instanceId);
      const configResult = await client.configGet();
      const config = configResult.config as Record<string, unknown>;
      const hash = configResult.hash;

      const channelKey = this.channelTypeToConfigKey(channelType);
      const channels = (config.channels ?? {}) as Record<string, Record<string, unknown>>;
      const channelConfig = channels[channelKey] ?? {};
      const currentAllowFrom = Array.isArray(channelConfig.allowFrom)
        ? (channelConfig.allowFrom as string[])
        : [];

      const updatedAllowFrom = currentAllowFrom.filter((id) => id !== senderId);

      await client.configPatch({
        patch: {
          channels: {
            [channelKey]: {
              allowFrom: updatedAllowFrom,
            },
          },
        },
        baseHash: hash,
      });

      this.logger.log(
        `Synced revocation to Gateway: instance=${instanceId} channel=${channelKey} removed=${senderId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to sync revocation to Gateway for instance=${instanceId}: ${err}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * List pairings for an instance, optionally filtered by state.
   */
  async listPairings(instanceId: string, state?: PairingState) {
    const where: Record<string, unknown> = { instanceId };
    if (state) {
      where.state = state;
    }

    return prisma.devicePairing.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get all pending pairings for an instance.
   */
  async getPendingPairings(instanceId: string) {
    return this.listPairings(instanceId, "PENDING" as PairingState);
  }

  /**
   * Approve a pairing request. If no record exists, create one with APPROVED state.
   * After DB update, syncs the approval to the Gateway's allowFrom config.
   */
  async approvePairing(
    instanceId: string,
    channelType: OpenClawChannelType,
    senderId: string,
  ) {
    const now = new Date();

    const record = await prisma.devicePairing.upsert({
      where: {
        instanceId_channelType_senderId: {
          instanceId,
          channelType,
          senderId,
        },
      },
      update: {
        state: "APPROVED",
        approvedAt: now,
      },
      create: {
        instanceId,
        channelType,
        senderId,
        state: "APPROVED",
        approvedAt: now,
      },
    });

    this.logger.log(
      `Approved pairing for instance=${instanceId} channel=${channelType} sender=${senderId}`,
    );

    await this.syncApprovalToGateway(instanceId, channelType, [senderId]);

    return record;
  }

  /**
   * Reject a pairing request. Throws if the pairing does not exist.
   */
  async rejectPairing(
    instanceId: string,
    channelType: OpenClawChannelType,
    senderId: string,
  ) {
    const existing = await prisma.devicePairing.findUnique({
      where: {
        instanceId_channelType_senderId: {
          instanceId,
          channelType,
          senderId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Pairing not found for instance=${instanceId} channel=${channelType} sender=${senderId}`,
      );
    }

    const record = await prisma.devicePairing.update({
      where: { id: existing.id },
      data: { state: "REJECTED" },
    });

    this.logger.log(
      `Rejected pairing for instance=${instanceId} channel=${channelType} sender=${senderId}`,
    );

    return record;
  }

  /**
   * Batch-approve all pending pairings for an instance.
   * Collects all pending senderIds grouped by channel, then syncs to Gateway in one call per channel.
   */
  async batchApproveAll(instanceId: string) {
    // Fetch pending pairings before updating so we know which senderIds to sync
    const pendingPairings = await prisma.devicePairing.findMany({
      where: { instanceId, state: "PENDING" },
      select: { channelType: true, senderId: true },
    });

    const now = new Date();

    const result = await prisma.devicePairing.updateMany({
      where: {
        instanceId,
        state: "PENDING",
      },
      data: {
        state: "APPROVED",
        approvedAt: now,
      },
    });

    this.logger.log(
      `Batch-approved ${result.count} pending pairings for instance=${instanceId}`,
    );

    // Group by channel type and sync to Gateway
    const byChannel = new Map<string, string[]>();
    for (const p of pendingPairings) {
      const existing = byChannel.get(p.channelType) ?? [];
      existing.push(p.senderId);
      byChannel.set(p.channelType, existing);
    }

    const syncPromises = Array.from(byChannel.entries()).map(
      ([channelType, senderIds]) =>
        this.syncApprovalToGateway(instanceId, channelType, senderIds),
    );
    await Promise.all(syncPromises);

    return result;
  }

  /**
   * Revoke an approved pairing. Throws if the pairing is not in APPROVED state.
   * After DB update, syncs the revocation to the Gateway's allowFrom config.
   */
  async revokePairing(
    instanceId: string,
    channelType: OpenClawChannelType,
    senderId: string,
  ) {
    const existing = await prisma.devicePairing.findUnique({
      where: {
        instanceId_channelType_senderId: {
          instanceId,
          channelType,
          senderId,
        },
      },
    });

    if (!existing || existing.state !== "APPROVED") {
      throw new NotFoundException(
        `No approved pairing found for instance=${instanceId} channel=${channelType} sender=${senderId}`,
      );
    }

    const now = new Date();

    const record = await prisma.devicePairing.update({
      where: { id: existing.id },
      data: {
        state: "REVOKED",
        revokedAt: now,
      },
    });

    this.logger.log(
      `Revoked pairing for instance=${instanceId} channel=${channelType} sender=${senderId}`,
    );

    await this.syncRevocationToGateway(instanceId, channelType, senderId);

    return record;
  }

  // ---------------------------------------------------------------------------
  // Short Code Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new pending pairing with a short code.
   * Enforces max 3 pending pairings per (instanceId, channelType).
   */
  async createPendingPairing(
    instanceId: string,
    channelType: OpenClawChannelType,
    senderId: string,
    senderName?: string,
  ) {
    // Check max pending limit
    const pendingCount = await prisma.devicePairing.count({
      where: {
        instanceId,
        channelType,
        state: "PENDING",
      },
    });

    if (pendingCount >= MAX_PENDING_PER_CHANNEL) {
      throw new BadRequestException(
        "Maximum 3 pending pairing requests per channel",
      );
    }

    const pairingCode = this.generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_EXPIRY_MS);

    const record = await prisma.devicePairing.upsert({
      where: {
        instanceId_channelType_senderId: {
          instanceId,
          channelType,
          senderId,
        },
      },
      update: {
        state: "PENDING",
        pairingCode,
        expiresAt,
        senderName: senderName ?? undefined,
      },
      create: {
        instanceId,
        channelType,
        senderId,
        senderName: senderName ?? undefined,
        state: "PENDING",
        pairingCode,
        expiresAt,
      },
    });

    this.logger.log(
      `Created pending pairing with code for instance=${instanceId} channel=${channelType} sender=${senderId}`,
    );

    return record;
  }

  /**
   * Find a pending pairing by its short code.
   */
  async findByCode(instanceId: string, code: string) {
    const pairings = await prisma.devicePairing.findMany({
      where: {
        instanceId,
        pairingCode: code,
        state: "PENDING",
      },
    });

    if (pairings.length === 0) {
      return null;
    }

    // Return the first non-expired one
    const now = new Date();
    return pairings.find((p) => !p.expiresAt || p.expiresAt > now) ?? null;
  }

  /**
   * Approve a pairing by its short code.
   */
  async approveByCode(instanceId: string, code: string) {
    const pairing = await this.findByCode(instanceId, code);

    if (!pairing) {
      throw new NotFoundException(
        `No valid pending pairing found with code=${code} for instance=${instanceId}`,
      );
    }

    // Check expiry
    if (pairing.expiresAt && pairing.expiresAt < new Date()) {
      throw new BadRequestException("Pairing code has expired");
    }

    return this.approvePairing(
      instanceId,
      pairing.channelType as OpenClawChannelType,
      pairing.senderId,
    );
  }

  // ---------------------------------------------------------------------------
  // Gateway Sync
  // ---------------------------------------------------------------------------

  /**
   * Sync pairings from the Gateway's live config.
   * Reads channels.*.allowFrom from Gateway and upserts DB records.
   */
  async syncPairingsFromGateway(instanceId: string) {
    try {
      const client = await this.getGatewayClient(instanceId);
      const configResult = await client.configGet();
      const config = configResult.config as Record<string, unknown>;
      const channels = (config.channels ?? {}) as Record<string, Record<string, unknown>>;

      for (const [channelKey, channelConfig] of Object.entries(channels)) {
        if (!channelConfig || typeof channelConfig !== "object") continue;

        const allowFrom = Array.isArray(channelConfig.allowFrom)
          ? (channelConfig.allowFrom as string[])
          : [];

        // Map config key back to enum value
        const channelType = this.configKeyToChannelType(channelKey);
        if (!channelType) continue;

        for (const senderId of allowFrom) {
          await prisma.devicePairing.upsert({
            where: {
              instanceId_channelType_senderId: {
                instanceId,
                channelType: channelType as OpenClawChannelType,
                senderId,
              },
            },
            update: {
              state: "APPROVED",
              approvedAt: new Date(),
            },
            create: {
              instanceId,
              channelType: channelType as OpenClawChannelType,
              senderId,
              state: "APPROVED",
              approvedAt: new Date(),
            },
          });
        }
      }

      this.logger.log(
        `Synced pairings from Gateway for instance=${instanceId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to sync pairings from Gateway for instance=${instanceId}: ${err}`,
      );
    }

    return this.listPairings(instanceId);
  }

  /**
   * Map a config key (e.g. "whatsapp") to a Prisma channel type enum (e.g. "WHATSAPP").
   */
  private configKeyToChannelType(key: string): string | null {
    const mapping: Record<string, string> = {
      whatsapp: "WHATSAPP",
      telegram: "TELEGRAM",
      discord: "DISCORD",
      slack: "SLACK",
      signal: "SIGNAL",
      imessage: "IMESSAGE",
      mattermost: "MATTERMOST",
      "google-chat": "GOOGLE_CHAT",
      "ms-teams": "MS_TEAMS",
      line: "LINE",
      matrix: "MATRIX",
    };
    return mapping[key] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Expiry Scheduler
  // ---------------------------------------------------------------------------

  /**
   * Expire stale PENDING pairings that have passed their expiresAt time.
   * Runs every 5 minutes.
   */
  @Cron("0 */5 * * * *")
  async expireStale(): Promise<number> {
    const now = new Date();

    const result = await prisma.devicePairing.updateMany({
      where: {
        state: "PENDING",
        expiresAt: { lt: now },
      },
      data: {
        state: "EXPIRED",
      },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale pairing requests`);
    }

    return result.count;
  }
}
