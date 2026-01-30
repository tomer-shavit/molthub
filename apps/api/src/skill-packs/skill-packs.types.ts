export interface SkillPackResponse {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  skills: Record<string, unknown>[];
  mcps: Record<string, unknown>[];
  envVars: Record<string, string>;
  isBuiltin: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  _count?: {
    botInstances: number;
  };
}

export interface SkillPackWithBots extends SkillPackResponse {
  botInstances: Array<{
    botInstance: {
      id: string;
      name: string;
      status: string;
      health: string;
    };
    envOverrides: Record<string, string>;
    attachedAt: Date;
  }>;
}

export interface BotAttachmentResponse {
  id: string;
  botInstanceId: string;
  skillPackId: string;
  envOverrides: Record<string, string>;
  attachedAt: Date;
}

export interface BulkAttachResult {
  successful: string[];
  failed: Array<{ botId: string; error: string }>;
}

export interface SyncResult {
  synced: number;
  bots: string[];
  packVersion: number;
}
