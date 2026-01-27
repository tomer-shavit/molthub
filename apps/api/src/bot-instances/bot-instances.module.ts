import { Module } from "@nestjs/common";
import { BotInstancesService } from "./bot-instances.service";
import { BotInstancesController } from "./bot-instances.controller";

@Module({
  controllers: [BotInstancesController],
  providers: [BotInstancesService],
  exports: [BotInstancesService],
})
export class BotInstancesModule {}