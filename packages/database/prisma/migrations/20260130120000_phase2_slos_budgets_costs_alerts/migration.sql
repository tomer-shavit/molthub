-- Phase 2: SLOs, Budgets, Costs, and Health Alerts

-- CreateEnum
CREATE TYPE "SloMetric" AS ENUM ('UPTIME', 'LATENCY_P50', 'LATENCY_P95', 'LATENCY_P99', 'ERROR_RATE', 'CHANNEL_HEALTH');

-- CreateEnum
CREATE TYPE "SloWindow" AS ENUM ('ROLLING_1H', 'ROLLING_24H', 'ROLLING_7D', 'ROLLING_30D', 'CALENDAR_DAY', 'CALENDAR_WEEK', 'CALENDAR_MONTH');

-- CreateEnum
CREATE TYPE "CostProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'AWS_BEDROCK', 'AZURE_OPENAI', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "SloDefinition" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "SloMetric" NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "window" "SloWindow" NOT NULL,
    "currentValue" DOUBLE PRECISION,
    "isBreached" BOOLEAN NOT NULL DEFAULT false,
    "breachedAt" TIMESTAMP(3),
    "breachCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "SloDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetConfig" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT,
    "fleetId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyLimitCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "warnThresholdPct" INTEGER NOT NULL DEFAULT 75,
    "criticalThresholdPct" INTEGER NOT NULL DEFAULT 90,
    "currentSpendCents" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "BudgetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEvent" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "provider" "CostProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL,
    "channelType" TEXT,
    "traceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlert" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT,
    "fleetId" TEXT,
    "rule" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "remediationAction" TEXT,
    "remediationNote" TEXT,
    "firstTriggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTriggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "consecutiveHits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SloDefinition_instanceId_idx" ON "SloDefinition"("instanceId");
CREATE INDEX "SloDefinition_metric_idx" ON "SloDefinition"("metric");
CREATE INDEX "SloDefinition_isBreached_idx" ON "SloDefinition"("isBreached");
CREATE INDEX "SloDefinition_isActive_idx" ON "SloDefinition"("isActive");
CREATE UNIQUE INDEX "SloDefinition_instanceId_name_key" ON "SloDefinition"("instanceId", "name");

-- CreateIndex
CREATE INDEX "BudgetConfig_instanceId_idx" ON "BudgetConfig"("instanceId");
CREATE INDEX "BudgetConfig_fleetId_idx" ON "BudgetConfig"("fleetId");
CREATE INDEX "BudgetConfig_isActive_idx" ON "BudgetConfig"("isActive");

-- CreateIndex
CREATE INDEX "CostEvent_instanceId_idx" ON "CostEvent"("instanceId");
CREATE INDEX "CostEvent_provider_idx" ON "CostEvent"("provider");
CREATE INDEX "CostEvent_occurredAt_idx" ON "CostEvent"("occurredAt");
CREATE INDEX "CostEvent_instanceId_occurredAt_idx" ON "CostEvent"("instanceId", "occurredAt");

-- CreateIndex
CREATE INDEX "HealthAlert_instanceId_idx" ON "HealthAlert"("instanceId");
CREATE INDEX "HealthAlert_fleetId_idx" ON "HealthAlert"("fleetId");
CREATE INDEX "HealthAlert_rule_idx" ON "HealthAlert"("rule");
CREATE INDEX "HealthAlert_severity_idx" ON "HealthAlert"("severity");
CREATE INDEX "HealthAlert_status_idx" ON "HealthAlert"("status");
CREATE INDEX "HealthAlert_firstTriggeredAt_idx" ON "HealthAlert"("firstTriggeredAt");

-- AddForeignKey
ALTER TABLE "SloDefinition" ADD CONSTRAINT "SloDefinition_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "BotInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetConfig" ADD CONSTRAINT "BudgetConfig_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "BotInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetConfig" ADD CONSTRAINT "BudgetConfig_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "BotInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlert" ADD CONSTRAINT "HealthAlert_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "BotInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlert" ADD CONSTRAINT "HealthAlert_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
