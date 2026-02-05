/**
 * Budgets domain client.
 * Handles budget CRUD operations.
 */

import { BaseHttpClient } from '../base-client';
import type {
  BudgetConfig,
  CreateBudgetPayload,
  UpdateBudgetPayload,
  BudgetFilters,
} from '../types/budgets';

export class BudgetsClient extends BaseHttpClient {
  /**
   * List all budgets with optional filters.
   */
  list(filters?: BudgetFilters): Promise<BudgetConfig[]> {
    return this.get('/budgets', filters);
  }

  /**
   * Create a new budget.
   */
  create(data: CreateBudgetPayload): Promise<BudgetConfig> {
    return this.post('/budgets', data);
  }

  /**
   * Update a budget.
   */
  update(id: string, data: UpdateBudgetPayload): Promise<BudgetConfig> {
    return this.patch(`/budgets/${id}`, data);
  }

  /**
   * Delete a budget.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/budgets/${id}`);
  }
}

export const budgetsClient = new BudgetsClient();
