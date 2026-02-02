import { Module } from "@nestjs/common";
import { CostsController } from "./costs.controller";
import { CostsService } from "./costs.service";
import { BudgetService } from "./budget.service";
import { CostCollectionService } from "./cost-collection.service";
import { HealthModule } from "../health/health.module";

@Module({
  imports: [HealthModule],
  controllers: [CostsController],
  providers: [CostsService, BudgetService, CostCollectionService],
  exports: [CostsService, BudgetService],
})
export class CostsModule {}
