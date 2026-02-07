import { InstanceStatus, Environment } from "./manifest";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  awsAccountId?: string;
  awsRegion?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Instance {
  id: string;
  workspaceId: string;
  name: string;
  environment: Environment;
  tags: Record<string, string>;
  status: InstanceStatus;
  desiredManifestId: string | null;
  lastReconcileAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManifestVersion {
  id: string;
  instanceId: string;
  version: number;
  content: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
}

// Template interface - Note: Use BotTemplate type from template.ts for full type
export interface BotTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  manifestTemplate: Record<string, unknown>;
  isBuiltin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeploymentEvent {
  id: string;
  instanceId: string;
  eventType: "RECONCILE_START" | "RECONCILE_SUCCESS" | "RECONCILE_ERROR" | "ECS_DEPLOYMENT" | "ECS_ROLLBACK";
  message: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}