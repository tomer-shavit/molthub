-- Add daily budget limit fields to BudgetConfig
ALTER TABLE "BudgetConfig" ADD COLUMN "dailyLimitCents" INTEGER;
ALTER TABLE "BudgetConfig" ADD COLUMN "dailyWarnThresholdPct" INTEGER DEFAULT 75;
ALTER TABLE "BudgetConfig" ADD COLUMN "dailyCriticalThresholdPct" INTEGER DEFAULT 90;
ALTER TABLE "BudgetConfig" ADD COLUMN "currentDailySpendCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BudgetConfig" ADD COLUMN "dailyPeriodStart" DATETIME;
