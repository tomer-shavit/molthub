import { Controller, Get, Post, Param, Query, NotFoundException } from "@nestjs/common";
import { AgentEvolutionService } from "./agent-evolution.service";

@Controller("bot-instances")
export class AgentEvolutionController {
  constructor(private readonly evolutionService: AgentEvolutionService) {}

  @Get(":id/live-state")
  async getLiveState(@Param("id") id: string): Promise<any> {
    try {
      return await this.evolutionService.getLiveState(id);
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        throw new NotFoundException(`BotInstance ${id} not found`);
      }
      throw err;
    }
  }

  @Get(":id/evolution")
  async getEvolution(@Param("id") id: string): Promise<any> {
    const snapshot = await this.evolutionService.getLatestSnapshot(id);

    if (!snapshot) {
      return {
        hasEvolved: false,
        totalChanges: 0,
        snapshot: null,
        message: "No evolution data captured yet. State sync runs every 2 minutes for connected bots.",
      };
    }

    return {
      hasEvolved: snapshot.hasEvolved,
      totalChanges: snapshot.totalChanges,
      gatewayReachable: snapshot.gatewayReachable,
      capturedAt: snapshot.capturedAt,
      diff: snapshot.diffFromDeployed,
      liveSkills: snapshot.liveSkills,
      liveMcpServers: snapshot.liveMcpServers,
      liveChannels: snapshot.liveChannels,
      liveToolProfile: snapshot.liveToolProfile,
      liveConfigHash: snapshot.liveConfigHash,
    };
  }

  @Get(":id/evolution/history")
  async getEvolutionHistory(
    @Param("id") id: string,
    @Query("limit") limit?: string,
  ): Promise<any> {
    const parsed = limit ? parseInt(limit, 10) : 50;
    const l = Math.max(1, Math.min(isNaN(parsed) ? 50 : parsed, 100));
    const snapshots = await this.evolutionService.getEvolutionHistory(id, l);
    return { snapshots };
  }

  @Post(":id/evolution/sync")
  async syncEvolution(@Param("id") id: string): Promise<any> {
    try {
      const snapshot = await this.evolutionService.captureState(id);
      return {
        hasEvolved: snapshot.hasEvolved,
        totalChanges: snapshot.totalChanges,
        gatewayReachable: snapshot.gatewayReachable,
        capturedAt: snapshot.capturedAt,
        diff: snapshot.diffFromDeployed,
        liveSkills: snapshot.liveSkills,
        liveMcpServers: snapshot.liveMcpServers,
        liveChannels: snapshot.liveChannels,
        liveToolProfile: snapshot.liveToolProfile,
        liveConfigHash: snapshot.liveConfigHash,
      };
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        throw new NotFoundException(`BotInstance ${id} not found`);
      }
      throw err;
    }
  }
}
