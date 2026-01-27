import { Module } from "@nestjs/common";
import { ReconcilerService } from "./reconciler.service";
import { ReconcilerController } from "./reconciler.controller";
import { DriftDetectionService } from "./drift-detection.service";
import { ReconcilerScheduler } from "./reconciler.scheduler";

@Module({
  controllers: [ReconcilerController],
  providers: [
    ReconcilerService,
    DriftDetectionService,
    ReconcilerScheduler,
  ],
  exports: [ReconcilerService, DriftDetectionService],
})
export class ReconcilerModule {}