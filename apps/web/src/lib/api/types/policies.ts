/**
 * Policy pack types.
 */

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  type: 'REQUIRED' | 'FORBIDDEN' | 'LIMIT' | 'PATTERN' | 'CUSTOM';
  target: string;
  condition: Record<string, unknown>;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}

export interface PolicyPack {
  id: string;
  name: string;
  description: string;
  workspaceId?: string;
  isBuiltin: boolean;
  autoApply: boolean;
  targetWorkspaces?: string[];
  targetEnvironments?: string[];
  targetTags?: Record<string, string>;
  rules: PolicyRule[];
  isEnforced: boolean;
  priority: number;
  version: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
