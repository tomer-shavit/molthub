/**
 * Overlay types.
 */

export interface Overlay {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  targetType: string;
  targetSelector: Record<string, unknown>;
  overrides: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  rollout?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
