import { Module } from "@nestjs/common";
import { StateSyncService } from "./state-sync.service";
import { StateSyncController } from "./state-sync.controller";

@Module({
  controllers: [StateSyncController],
  providers: [StateSyncService],
  exports: [StateSyncService],
})
export class StateSyncModule {}
