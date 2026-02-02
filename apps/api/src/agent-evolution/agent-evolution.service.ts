import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@clawster/database";
import { GatewayManager } from "@clawster/gateway-client";
import type { GatewayConnectionOptions } from "@clawster/gateway-client";
import {
  computeEvolutionDiff,
  extractSkills,
  extractMcpServers,
  extractEnabledChannels,
  extractToolProfile,
  summarizeEvolution,
} from "@clawster/core";
import { createHash } from "crypto";

@Injectable()
export class AgentEvolutionService {
  private readonly logger = new Logger(AgentEvolutionService.name);
  private readonly gatewayManager = new GatewayManager();

  /**
   * Capture the live state of a bot instance from its Gateway and store a snapshot.
   */
  async captureState(instanceId: string): Promise<any> {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error(`BotInstance ${instanceId} not found`);
    }

    let liveConfig: Record<string, unknown> = {};
    let liveConfigHash = "";
    let gatewayReachable = false;

    try {
      const client = await this.getGatewayClient(instance);
      gatewayReachable = true;

      const configResult = await client.configGet();
      liveConfig = configResult.config as Record<string, unknown>;
      liveConfigHash = configResult.hash || this.hashConfig(liveConfig);
    } catch (err) {
      this.logger.warn(`Failed to reach Gateway for ${instanceId}: ${err}`);
      // Store snapshot with gatewayReachable=false, use empty config
    }

    const deployedConfig = this.extractDeployedConfig(typeof instance.desiredManifest === "string" ? JSON.parse(instance.desiredManifest) : instance.desiredManifest as Record<string, unknown>);

    const liveSkills = extractSkills(liveConfig);
    const liveMcpServers = extractMcpServers(liveConfig);
    const liveChannels = extractEnabledChannels(liveConfig);
    const liveToolProfileData = extractToolProfile(liveConfig);

    const diff = gatewayReachable
      ? computeEvolutionDiff(deployedConfig, liveConfig)
      : { changes: [], hasEvolved: false, totalChanges: 0 };

    const snapshot = await prisma.agentStateSnapshot.create({
      data: {
        instanceId,
        liveConfig: JSON.stringify(liveConfig),
        liveConfigHash,
        liveSkills: JSON.stringify(liveSkills),
        liveMcpServers: JSON.stringify(liveMcpServers),
        liveChannels: JSON.stringify(liveChannels),
        liveToolProfile: JSON.stringify(liveToolProfileData),
        diffFromDeployed: JSON.stringify(diff),
        hasEvolved: diff.hasEvolved,
        totalChanges: diff.totalChanges,
        gatewayReachable,
      },
    });

    this.logger.debug(
      `Captured state for ${instanceId}: ${diff.totalChanges} changes, reachable=${gatewayReachable}`,
    );

    return snapshot;
  }

  /**
   * Get the most recent snapshot for an instance.
   */
  async getLatestSnapshot(instanceId: string): Promise<any> {
    return prisma.agentStateSnapshot.findFirst({
      where: { instanceId },
      orderBy: { capturedAt: "desc" },
    });
  }

  /**
   * Get evolution history for an instance.
   */
  async getEvolutionHistory(instanceId: string, limit = 50): Promise<any[]> {
    return prisma.agentStateSnapshot.findMany({
      where: { instanceId },
      orderBy: { capturedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Fetch live state directly from Gateway (no caching).
   */
  async getLiveState(instanceId: string): Promise<any> {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error(`BotInstance ${instanceId} not found`);
    }

    try {
      const client = await this.getGatewayClient(instance);

      const [configResult, healthResult] = await Promise.all([
        client.configGet().catch(() => null),
        client.health().catch(() => null),
      ]);

      const liveConfig = (configResult?.config as Record<string, unknown>) || {};
      const deployedConfig = this.extractDeployedConfig(typeof instance.desiredManifest === "string" ? JSON.parse(instance.desiredManifest) : instance.desiredManifest as Record<string, unknown>);
      const diff = computeEvolutionDiff(deployedConfig, liveConfig);
      const summary = summarizeEvolution(diff);

      return {
        gatewayReachable: true,
        config: liveConfig,
        configHash: configResult?.hash || null,
        health: healthResult || null,
        diff,
        summary,
        skills: extractSkills(liveConfig),
        mcpServers: extractMcpServers(liveConfig),
        channels: extractEnabledChannels(liveConfig),
        toolProfile: extractToolProfile(liveConfig),
      };
    } catch (err) {
      this.logger.warn(`Gateway unreachable for ${instanceId}: ${err}`);

      // Fallback to latest snapshot
      const latest = await this.getLatestSnapshot(instanceId);
      return {
        gatewayReachable: false,
        config: latest?.liveConfig ? (typeof latest.liveConfig === "string" ? JSON.parse(latest.liveConfig) : latest.liveConfig) as Record<string, unknown> : null,
        configHash: latest?.liveConfigHash || null,
        health: null,
        diff: latest?.diffFromDeployed ? (typeof latest.diffFromDeployed === "string" ? JSON.parse(latest.diffFromDeployed) : latest.diffFromDeployed) : { changes: [], hasEvolved: false, totalChanges: 0 },
        summary: latest ? summarizeEvolution(typeof latest.diffFromDeployed === "string" ? JSON.parse(latest.diffFromDeployed) : latest.diffFromDeployed) : { hasEvolved: false, totalChanges: 0, categoryCounts: {}, changedCategories: [] },
        skills: latest?.liveSkills ? (typeof latest.liveSkills === "string" ? JSON.parse(latest.liveSkills) : latest.liveSkills) as string[] : [],
        mcpServers: latest?.liveMcpServers ? (typeof latest.liveMcpServers === "string" ? JSON.parse(latest.liveMcpServers) : latest.liveMcpServers) as string[] : [],
        channels: latest?.liveChannels ? (typeof latest.liveChannels === "string" ? JSON.parse(latest.liveChannels) : latest.liveChannels) as string[] : [],
        toolProfile: latest?.liveToolProfile ? (typeof latest.liveToolProfile === "string" ? JSON.parse(latest.liveToolProfile) : latest.liveToolProfile) : null,
        lastSnapshotAt: latest?.capturedAt || null,
      };
    }
  }

  /**
   * Prune old snapshots — keep max per instance, delete older than maxAge.
   */
  async cleanupOldSnapshots(maxAgeDays = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    // Delete by age
    const aged = await prisma.agentStateSnapshot.deleteMany({
      where: { capturedAt: { lt: cutoff } },
    });

    this.logger.debug(`Pruned ${aged.count} snapshots older than ${maxAgeDays} days`);
    return aged.count;
  }

  // --- Helpers ---

  private async getGatewayClient(instance: { id: string; gatewayPort?: number | null }) {
    const gwConn = await prisma.gatewayConnection.findUnique({
      where: { instanceId: instance.id },
    });

    const host = gwConn?.host ?? "localhost";
    const port = gwConn?.port ?? instance.gatewayPort ?? 18789;
    const token = gwConn?.authToken ?? undefined;

    const options: GatewayConnectionOptions = {
      host,
      port,
      auth: token ? { mode: "token", token } : { mode: "token", token: "clawster" },
      timeoutMs: 10_000,
    };

    return this.gatewayManager.getClient(instance.id, options);
  }

  private extractDeployedConfig(manifest: Record<string, unknown>): Record<string, unknown> {
    const spec = (manifest?.spec as Record<string, unknown>) || manifest;
    return (spec?.openclawConfig as Record<string, unknown>) || spec || {};
  }

  private hashConfig(config: Record<string, unknown>): string {
    const normalized = JSON.stringify(config);
    return createHash("sha256").update(normalized).digest("hex");
  }
}
