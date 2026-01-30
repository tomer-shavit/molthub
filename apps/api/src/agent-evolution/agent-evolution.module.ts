import { Module } from "@nestjs/common";
import { AgentEvolutionService } from "./agent-evolution.service";
import { AgentEvolutionScheduler } from "./agent-evolution.scheduler";
import { AgentEvolutionController } from "./agent-evolution.controller";

@Module({
  controllers: [AgentEvolutionController],
  providers: [AgentEvolutionService, AgentEvolutionScheduler],
  exports: [AgentEvolutionService],
})
export class AgentEvolutionModule {}
