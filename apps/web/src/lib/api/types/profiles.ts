/**
 * Profile types.
 */

export type MergeStrategy = "override" | "merge" | "prepend" | "append";

export interface Profile {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  fleetIds: string[];
  defaults: Record<string, unknown>;
  mergeStrategy: Record<string, unknown>;
  allowInstanceOverrides: boolean;
  lockedFields: string[];
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateProfilePayload {
  workspaceId: string;
  name: string;
  description: string;
  fleetIds?: string[];
  defaults: Record<string, unknown>;
  mergeStrategy?: Record<string, MergeStrategy>;
  allowInstanceOverrides?: boolean;
  lockedFields?: string[];
  priority?: number;
  createdBy?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  description?: string;
  fleetIds?: string[];
  defaults?: Record<string, unknown>;
  mergeStrategy?: Record<string, MergeStrategy>;
  allowInstanceOverrides?: boolean;
  lockedFields?: string[];
  priority?: number;
  isActive?: boolean;
}

export interface ProfileFilters {
  workspaceId?: string;
  fleetId?: string;
  isActive?: boolean;
}
