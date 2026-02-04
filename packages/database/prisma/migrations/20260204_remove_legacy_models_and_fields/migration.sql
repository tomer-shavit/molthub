-- Remove legacy/unused tables
DROP TABLE IF EXISTS "AuthUser";
DROP TABLE IF EXISTS "CredentialRotation";

-- Remove unused columns from BotInstance
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- However, for SQLite we can use newer versions that support it

-- Create new BotInstance table without legacy fields
CREATE TABLE "BotInstance_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "templateId" TEXT,
    "profileId" TEXT,
    "overlayIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "desiredManifest" TEXT NOT NULL,
    "appliedManifestVersion" TEXT,
    "tags" TEXT NOT NULL DEFAULT '{}',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "lastReconcileAt" DATETIME,
    "lastHealthCheckAt" DATETIME,
    "lastError" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "runningSince" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    "deploymentType" TEXT,
    "deploymentTargetId" TEXT,
    "gatewayPort" INTEGER,
    "profileName" TEXT,
    "openclawVersion" TEXT,
    "configHash" TEXT,
    "lastCostSyncDate" TEXT,
    "aiGatewayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiGatewayUrl" TEXT,
    "aiGatewayApiKey" TEXT,
    "aiGatewayProvider" TEXT NOT NULL DEFAULT 'vercel-ai-gateway',
    CONSTRAINT "BotInstance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BotInstance_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BotInstance_deploymentTargetId_fkey" FOREIGN KEY ("deploymentTargetId") REFERENCES "DeploymentTarget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy data from old table (excluding removed columns)
INSERT INTO "BotInstance_new" (
    "id", "name", "workspaceId", "fleetId", "templateId", "profileId", "overlayIds",
    "status", "health", "desiredManifest", "appliedManifestVersion", "tags", "metadata",
    "lastReconcileAt", "lastHealthCheckAt", "lastError", "errorCount",
    "restartCount", "runningSince", "createdAt", "updatedAt", "createdBy",
    "deploymentType", "deploymentTargetId", "gatewayPort", "profileName",
    "openclawVersion", "configHash", "lastCostSyncDate",
    "aiGatewayEnabled", "aiGatewayUrl", "aiGatewayApiKey", "aiGatewayProvider"
)
SELECT
    "id", "name", "workspaceId", "fleetId", "templateId", "profileId", "overlayIds",
    "status", "health", "desiredManifest", "appliedManifestVersion", "tags", "metadata",
    "lastReconcileAt", "lastHealthCheckAt", "lastError", "errorCount",
    "restartCount", "runningSince", "createdAt", "updatedAt", "createdBy",
    "deploymentType", "deploymentTargetId", "gatewayPort", "profileName",
    "openclawVersion", "configHash", "lastCostSyncDate",
    "aiGatewayEnabled", "aiGatewayUrl", "aiGatewayApiKey", "aiGatewayProvider"
FROM "BotInstance";

-- Drop old table and rename new one
DROP TABLE "BotInstance";
ALTER TABLE "BotInstance_new" RENAME TO "BotInstance";

-- Recreate indexes for BotInstance
CREATE UNIQUE INDEX "BotInstance_workspaceId_name_key" ON "BotInstance"("workspaceId", "name");
CREATE INDEX "BotInstance_workspaceId_idx" ON "BotInstance"("workspaceId");
CREATE INDEX "BotInstance_fleetId_idx" ON "BotInstance"("fleetId");
CREATE INDEX "BotInstance_status_idx" ON "BotInstance"("status");
CREATE INDEX "BotInstance_health_idx" ON "BotInstance"("health");

-- Create new Fleet table without legacy fields
CREATE TABLE "Fleet_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT NOT NULL DEFAULT '{}',
    "defaultProfileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fleet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy data from old table (excluding removed columns)
INSERT INTO "Fleet_new" (
    "id", "name", "workspaceId", "environment", "description", "status", "tags",
    "defaultProfileId", "createdAt", "updatedAt"
)
SELECT
    "id", "name", "workspaceId", "environment", "description", "status", "tags",
    "defaultProfileId", "createdAt", "updatedAt"
FROM "Fleet";

-- Drop old table and rename new one
DROP TABLE "Fleet";
ALTER TABLE "Fleet_new" RENAME TO "Fleet";

-- Recreate indexes for Fleet
CREATE UNIQUE INDEX "Fleet_workspaceId_name_key" ON "Fleet"("workspaceId", "name");
CREATE INDEX "Fleet_workspaceId_idx" ON "Fleet"("workspaceId");
CREATE INDEX "Fleet_status_idx" ON "Fleet"("status");
