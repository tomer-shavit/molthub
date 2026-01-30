import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@molthub/database";
import type { PairingState, MoltbotChannelType } from "@molthub/database";

@Injectable()
export class PairingService {
  private readonly logger = new Logger(PairingService.name);

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
   */
  async approvePairing(
    instanceId: string,
    channelType: MoltbotChannelType,
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

    return record;
  }

  /**
   * Reject a pairing request. Throws if the pairing does not exist.
   */
  async rejectPairing(
    instanceId: string,
    channelType: MoltbotChannelType,
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
   */
  async batchApproveAll(instanceId: string) {
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

    return result;
  }

  /**
   * Revoke an approved pairing. Throws if the pairing is not in APPROVED state.
   */
  async revokePairing(
    instanceId: string,
    channelType: MoltbotChannelType,
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

    return record;
  }

  /**
   * Sync pairings from the Gateway's live config.
   * TODO: When GatewayManager is injectable, call config.get to read channels.*.allowFrom and sync with DB
   */
  async syncPairingsFromGateway(instanceId: string) {
    this.logger.debug(
      `syncPairingsFromGateway called for instance=${instanceId} — returning DB state (gateway sync not yet implemented)`,
    );

    return this.listPairings(instanceId);
  }
}
