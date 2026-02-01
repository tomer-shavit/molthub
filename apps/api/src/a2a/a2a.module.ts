import { Module } from "@nestjs/common";
import { TracesModule } from "../traces/traces.module";
import { A2aController } from "./a2a.controller";
import { A2aAgentCardService } from "./a2a-agent-card.service";
import { A2aMessageService } from "./a2a-message.service";

@Module({
  imports: [TracesModule],
  controllers: [A2aController],
  providers: [A2aAgentCardService, A2aMessageService],
  exports: [A2aAgentCardService, A2aMessageService],
})
export class A2aModule {}
