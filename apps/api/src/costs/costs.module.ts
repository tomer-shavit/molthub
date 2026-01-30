import { Module } from "@nestjs/common";
import { CostsController } from "./costs.controller";
import { CostsService } from "./costs.service";
import { BudgetService } from "./budget.service";

@Module({
  controllers: [CostsController],
  providers: [CostsService, BudgetService],
  exports: [CostsService, BudgetService],
})
export class CostsModule {}
