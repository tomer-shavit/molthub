import { Module } from "@nestjs/common";
import { ReconcilerService } from "./reconciler.service";
import { ReconcilerController } from "./reconciler.controller";

@Module({
  controllers: [ReconcilerController],
  providers: [ReconcilerService],
  exports: [ReconcilerService],
})
export class ReconcilerModule {}