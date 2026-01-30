"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BudgetConfig } from "@/lib/api";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getGaugeColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-yellow-500";
  return "bg-green-500";
}

function getGaugeTextColor(pct: number): string {
  if (pct >= 90) return "text-red-600";
  if (pct >= 75) return "text-yellow-600";
  return "text-green-600";
}

interface BudgetGaugeProps {
  budget: BudgetConfig;
}

export function BudgetGauge({ budget }: BudgetGaugeProps) {
  const pct =
    budget.monthlyLimitCents > 0
      ? (budget.currentSpendCents / budget.monthlyLimitCents) * 100
      : 0;
  const clampedPct = Math.min(pct, 100);
  const barColor = getGaugeColor(pct);
  const textColor = getGaugeTextColor(pct);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{budget.name}</CardTitle>
          {!budget.isActive && (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>
        {budget.description && (
          <p className="text-xs text-muted-foreground">{budget.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Spend vs Limit */}
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-bold ${textColor}`}>
              {formatCents(budget.currentSpendCents)}
            </span>
            <span className="text-sm text-muted-foreground">
              of {formatCents(budget.monthlyLimitCents)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${clampedPct}%` }}
            />
          </div>

          {/* Percentage and thresholds */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className={`font-medium ${textColor}`}>
              {pct.toFixed(1)}% used
            </span>
            <span>
              Warn: {budget.warnThresholdPct}% | Critical:{" "}
              {budget.criticalThresholdPct}%
            </span>
          </div>

          {/* Currency */}
          <div className="text-xs text-muted-foreground">
            Currency: {budget.currency}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface BudgetGaugeListProps {
  budgets: BudgetConfig[];
}

export function BudgetGaugeList({ budgets }: BudgetGaugeListProps) {
  if (budgets.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-8">
          <p className="text-muted-foreground">No budgets configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {budgets.map((budget) => (
        <BudgetGauge key={budget.id} budget={budget} />
      ))}
    </div>
  );
}
