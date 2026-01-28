-- CreateTable SkillPack
CREATE TABLE "SkillPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "skills" JSONB NOT NULL DEFAULT '[]',
    "mcps" JSONB NOT NULL DEFAULT '[]',
    "envVars" JSONB NOT NULL DEFAULT '{}',
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "SkillPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable BotInstanceSkillPack (junction table)
CREATE TABLE "BotInstanceSkillPack" (
    "id" TEXT NOT NULL,
    "botInstanceId" TEXT NOT NULL,
    "skillPackId" TEXT NOT NULL,
    "envOverrides" JSONB NOT NULL DEFAULT '{}',
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotInstanceSkillPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex SkillPack
CREATE UNIQUE INDEX "SkillPack_workspaceId_name_key" ON "SkillPack"("workspaceId", "name");
CREATE INDEX "SkillPack_workspaceId_idx" ON "SkillPack"("workspaceId");
CREATE INDEX "SkillPack_isBuiltin_idx" ON "SkillPack"("isBuiltin");

-- CreateIndex BotInstanceSkillPack
CREATE UNIQUE INDEX "BotInstanceSkillPack_botInstanceId_skillPackId_key" ON "BotInstanceSkillPack"("botInstanceId", "skillPackId");
CREATE INDEX "BotInstanceSkillPack_botInstanceId_idx" ON "BotInstanceSkillPack"("botInstanceId");
CREATE INDEX "BotInstanceSkillPack_skillPackId_idx" ON "BotInstanceSkillPack"("skillPackId");

-- AddForeignKey SkillPack -> Workspace
ALTER TABLE "SkillPack" ADD CONSTRAINT "SkillPack_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey BotInstanceSkillPack -> BotInstance
ALTER TABLE "BotInstanceSkillPack" ADD CONSTRAINT "BotInstanceSkillPack_botInstanceId_fkey" FOREIGN KEY ("botInstanceId") REFERENCES "BotInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey BotInstanceSkillPack -> SkillPack
ALTER TABLE "BotInstanceSkillPack" ADD CONSTRAINT "BotInstanceSkillPack_skillPackId_fkey" FOREIGN KEY ("skillPackId") REFERENCES "SkillPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
