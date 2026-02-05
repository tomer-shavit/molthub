/**
 * Bot routing rules domain client.
 * Handles routing rule CRUD and delegation.
 */

import { BaseHttpClient } from '../base-client';
import type {
  BotRoutingRule,
  CreateBotRoutingRulePayload,
  UpdateBotRoutingRulePayload,
  DelegateRequestPayload,
  DelegationResult,
  RoutingRuleFilters,
} from '../types/routing';

export class RoutingClient extends BaseHttpClient {
  /**
   * List all routing rules with optional filters.
   */
  list(filters?: RoutingRuleFilters): Promise<BotRoutingRule[]> {
    return this.get('/bot-routing-rules', filters);
  }

  /**
   * Get a single routing rule by ID.
   */
  getById(id: string): Promise<BotRoutingRule> {
    return this.get(`/bot-routing-rules/${id}`);
  }

  /**
   * Create a new routing rule.
   */
  create(data: CreateBotRoutingRulePayload): Promise<BotRoutingRule> {
    return this.post('/bot-routing-rules', data);
  }

  /**
   * Update a routing rule.
   */
  update(id: string, data: UpdateBotRoutingRulePayload): Promise<BotRoutingRule> {
    return this.patch(`/bot-routing-rules/${id}`, data);
  }

  /**
   * Delete a routing rule.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/bot-routing-rules/${id}`);
  }

  /**
   * Delegate a message based on routing rules.
   */
  delegate(data: DelegateRequestPayload): Promise<DelegationResult> {
    return this.post('/bot-routing-rules/delegate', data);
  }
}

export const routingClient = new RoutingClient();
