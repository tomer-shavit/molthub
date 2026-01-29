import { Module } from "@nestjs/common";
import { ReconcilerService } from "./reconciler.service";
import { ReconcilerController } from "./reconciler.controller";
import { ConfigGeneratorService } from "./config-generator.service";
import { LifecycleManagerService } from "./lifecycle-manager.service";
import { DriftDetectionService } from "./drift-detection.service";
import { ReconcilerScheduler } from "./reconciler.scheduler";

@Module({
  controllers: [ReconcilerController],
  providers: [
    ConfigGeneratorService,
    LifecycleManagerService,
    DriftDetectionService,
    ReconcilerService,
    ReconcilerScheduler,
  ],
  exports: [
    ReconcilerService,
    ConfigGeneratorService,
    LifecycleManagerService,
    DriftDetectionService,
  ],
})
export class ReconcilerModule {}
