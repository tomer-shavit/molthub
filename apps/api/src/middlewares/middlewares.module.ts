import { Module } from "@nestjs/common";
import { BotInstancesModule } from "../bot-instances/bot-instances.module";
import { MiddlewareRegistryController } from "./middleware-registry.controller";
import { BotMiddlewaresController } from "./bot-middlewares.controller";
import { MiddlewareRegistryService } from "./middleware-registry.service";
import { MiddlewareAssignmentService } from "./middleware-assignment.service";

@Module({
  imports: [BotInstancesModule],
  controllers: [MiddlewareRegistryController, BotMiddlewaresController],
  providers: [MiddlewareRegistryService, MiddlewareAssignmentService],
})
export class MiddlewaresModule {}
