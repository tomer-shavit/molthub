import { Module } from "@nestjs/common";
import { SlosController } from "./slos.controller";
import { SlosService } from "./slos.service";
import { SloEvaluatorService } from "./slo-evaluator.service";

@Module({
  controllers: [SlosController],
  providers: [SlosService, SloEvaluatorService],
  exports: [SlosService, SloEvaluatorService],
})
export class SlosModule {}
