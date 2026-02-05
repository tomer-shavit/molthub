import type {
  CostEvent,
  BudgetConfig,
  Prisma,
} from "@prisma/client";
import type { PaginationOptions, PaginatedResult, TransactionClient } from "./base";

// ============================================
// FILTER TYPES
// ============================================

export interface CostEventFilters {
  instanceId?: string;
  provider?: string;
  model?: string;
  channelType?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CostSummaryFilters {
  instanceId?: string;
  fleetId?: string;
  workspaceId?: string;
  provider?: string;
  startDate?: Date;
  endDate?: Date;
}

// ============================================
// RESULT TYPES
// ============================================

export interface CostSummary {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEvents: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface CostSummaryByInstance extends CostSummary {
  instanceId: string;
  instanceName?: string;
}

export interface CostSummaryByProvider extends CostSummary {
  provider: string;
}

export interface CostSummaryByModel extends CostSummary {
  provider: string;
  model: string;
}

export interface BudgetStatus {
  budgetConfig: BudgetConfig;
  currentSpendCents: number;
  remainingCents: number;
  percentUsed: number;
  isOverBudget: boolean;
  isWarning: boolean;
  isCritical: boolean;
}

// ============================================
// INPUT TYPES
// ============================================

export type CreateCostEventInput = Omit<
  Prisma.CostEventCreateInput,
  "instance"
> & {
  instanceId: string;
};

export type UpdateBudgetSpendInput = {
  id: string;
  currentSpendCents: number;
};

export interface BudgetFilters {
  instanceId?: string;
  fleetId?: string;
  isActive?: boolean;
}

// ============================================
// REPOSITORY INTERFACE
// ============================================

/**
 * Input for upserting a daily cost event (for incremental sync)
 */
export interface UpsertDailyCostInput {
  instanceId: string;
  date: string; // YYYY-MM-DD format
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

/**
 * Result of upserting a daily cost event
 */
export interface UpsertDailyCostResult {
  event: CostEvent;
  deltaInputTokens: number;
  deltaOutputTokens: number;
  deltaCostCents: number;
  isNew: boolean;
}

export interface ICostRepository {
  // ==========================================
  // COST EVENTS
  // ==========================================

  /**
   * Record a new cost event (token usage)
   */
  recordEvent(
    data: CreateCostEventInput,
    tx?: TransactionClient
  ): Promise<CostEvent>;

  /**
   * Upsert a daily cost event with delta-based budget updates.
   * - If event exists for (instanceId, date): updates with new totals, budget gets delta
   * - If event doesn't exist: creates new event, budget gets full amount
   * This allows safe re-syncing of the same day without double-counting.
   */
  upsertDailyCostEvent(
    data: UpsertDailyCostInput,
    tx?: TransactionClient
  ): Promise<UpsertDailyCostResult>;

  /**
   * Find cost events by instance ID
   */
  findByInstance(
    instanceId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<CostEvent>>;

  /**
   * Find cost events within a date range
   */
  findByDateRange(
    startDate: Date,
    endDate: Date,
    filters?: CostEventFilters,
    options?: PaginationOptions
  ): Promise<PaginatedResult<CostEvent>>;

  // ==========================================
  // SUMMARIES
  // ==========================================

  /**
   * Get cost summary for a specific instance
   */
  getSummaryByInstance(
    instanceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CostSummary>;

  /**
   * Get cost summary grouped by instances
   */
  getSummaryByInstances(
    filters: CostSummaryFilters
  ): Promise<CostSummaryByInstance[]>;

  /**
   * Get cost summary grouped by provider
   */
  getSummaryByProvider(
    filters: CostSummaryFilters
  ): Promise<CostSummaryByProvider[]>;

  /**
   * Get cost summary grouped by model
   */
  getSummaryByModel(
    filters: CostSummaryFilters
  ): Promise<CostSummaryByModel[]>;

  /**
   * Get cost summary for a date range (aggregate)
   */
  getSummaryByDateRange(
    startDate: Date,
    endDate: Date,
    filters?: CostSummaryFilters
  ): Promise<CostSummary>;

  // ==========================================
  // BUDGETS
  // ==========================================

  /**
   * Find budget configuration by ID
   */
  findBudget(id: string): Promise<BudgetConfig | null>;

  /**
   * Find all budgets matching filters
   */
  findBudgets(filters?: BudgetFilters): Promise<BudgetConfig[]>;

  /**
   * Find budget configuration by instance ID
   */
  findBudgetByInstance(instanceId: string): Promise<BudgetConfig | null>;

  /**
   * Find budget configuration by fleet ID
   */
  findBudgetByFleet(fleetId: string): Promise<BudgetConfig | null>;

  /**
   * Find all active budgets for a workspace (via instances and fleets)
   */
  findBudgetsByWorkspace(workspaceId: string): Promise<BudgetConfig[]>;

  /**
   * Create a new budget configuration
   */
  createBudget(
    data: Prisma.BudgetConfigCreateInput,
    tx?: TransactionClient
  ): Promise<BudgetConfig>;

  /**
   * Update budget spend amount
   */
  updateBudgetSpend(
    id: string,
    spendCents: number,
    tx?: TransactionClient
  ): Promise<BudgetConfig>;

  /**
   * Increment budget spend by amount
   */
  incrementBudgetSpend(
    id: string,
    incrementCents: number,
    tx?: TransactionClient
  ): Promise<BudgetConfig>;

  /**
   * Reset budget period (typically monthly)
   */
  resetBudgetPeriod(
    id: string,
    newPeriodStart: Date,
    newPeriodEnd?: Date,
    tx?: TransactionClient
  ): Promise<BudgetConfig>;

  /**
   * Get budget status with computed fields
   */
  getBudgetStatus(id: string): Promise<BudgetStatus | null>;

  /**
   * Get all budget statuses for a workspace
   */
  getBudgetStatusesByWorkspace(workspaceId: string): Promise<BudgetStatus[]>;

  /**
   * Delete a budget configuration
   */
  deleteBudget(id: string, tx?: TransactionClient): Promise<void>;

  /**
   * Update a budget configuration
   */
  updateBudget(
    id: string,
    data: Prisma.BudgetConfigUpdateInput,
    tx?: TransactionClient
  ): Promise<BudgetConfig>;

  /**
   * Reset all active budgets for a new period (bulk operation)
   * Returns the count of budgets reset
   */
  resetAllActiveBudgets(
    newPeriodStart: Date,
    newPeriodEnd: Date,
    tx?: TransactionClient
  ): Promise<number>;

  /**
   * Reset daily spend for all active budgets with daily limits
   * Returns the count of budgets reset
   */
  resetAllDailyBudgets(
    newDailyPeriodStart: Date,
    tx?: TransactionClient
  ): Promise<number>;
}
