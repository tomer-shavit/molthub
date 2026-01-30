import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { CostEvent, BudgetConfig } from "@molthub/database";
import { CostsService, CostSummaryResult, PaginatedCostEvents } from "./costs.service";
import { BudgetService } from "./budget.service";
import {
  CreateCostEventDto,
  CostQueryDto,
  CostSummaryQueryDto,
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetQueryDto,
} from "./costs.dto";

@Controller()
export class CostsController {
  constructor(
    private readonly costsService: CostsService,
    private readonly budgetService: BudgetService,
  ) {}

  // ============================================
  // Cost Event Endpoints
  // ============================================

  @Get("costs/events")
  listCostEvents(@Query() query: CostQueryDto): Promise<PaginatedCostEvents> {
    return this.costsService.listCostEvents(query);
  }

  @Post("costs/events")
  recordCostEvent(@Body() dto: CreateCostEventDto): Promise<CostEvent> {
    return this.costsService.recordCostEvent(dto);
  }

  @Get("costs/summary")
  getCostSummary(@Query() query: CostSummaryQueryDto): Promise<CostSummaryResult> {
    return this.costsService.getCostSummary(query);
  }

  @Get("costs/instance/:instanceId")
  getInstanceCosts(
    @Param("instanceId") instanceId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<CostSummaryResult> {
    return this.costsService.getInstanceCosts(instanceId, from, to);
  }

  // ============================================
  // Budget Endpoints
  // ============================================

  @Get("budgets")
  listBudgets(@Query() query: BudgetQueryDto): Promise<BudgetConfig[]> {
    return this.budgetService.findAll(query);
  }

  @Get("budgets/:id")
  getBudget(@Param("id") id: string): Promise<BudgetConfig> {
    return this.budgetService.findOne(id);
  }

  @Post("budgets")
  createBudget(@Body() dto: CreateBudgetDto): Promise<BudgetConfig> {
    return this.budgetService.create(dto);
  }

  @Patch("budgets/:id")
  updateBudget(
    @Param("id") id: string,
    @Body() dto: UpdateBudgetDto,
  ): Promise<BudgetConfig> {
    return this.budgetService.update(id, dto);
  }

  @Delete("budgets/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBudget(@Param("id") id: string): Promise<void> {
    await this.budgetService.remove(id);
  }
}
