/**
 * Bot routing rule types.
 */

export interface BotRoutingRule {
  id: string;
  workspaceId: string;
  sourceBotId: string;
  targetBotId: string;
  triggerPattern: string;
  description: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  sourceBot?: { id: string; name: string };
  targetBot?: { id: string; name: string };
}

export interface DelegateRequestPayload {
  sourceBotId: string;
  message: string;
  sessionId?: string;
}

export interface DelegationResult {
  delegated: true;
  targetBotId: string;
  targetBotName: string;
  response: string | undefined;
  traceId: string;
  sessionId: string;
}

export interface CreateBotRoutingRulePayload {
  sourceBotId: string;
  targetBotId: string;
  triggerPattern: string;
  description: string;
  priority?: number;
  enabled?: boolean;
}

export interface UpdateBotRoutingRulePayload {
  sourceBotId?: string;
  targetBotId?: string;
  triggerPattern?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
}

export interface RoutingRuleFilters {
  sourceBotId?: string;
  targetBotId?: string;
  enabled?: boolean;
}
