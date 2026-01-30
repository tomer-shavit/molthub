"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CostSummaryByProvider, CostSummaryByModel } from "@/lib/api";

const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "bg-green-500",
  ANTHROPIC: "bg-orange-500",
  GOOGLE: "bg-blue-500",
  AWS_BEDROCK: "bg-yellow-500",
  AZURE_OPENAI: "bg-cyan-500",
  CUSTOM: "bg-gray-500",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CostBreakdownProps {
  byProvider: CostSummaryByProvider[];
  byModel: CostSummaryByModel[];
  totalCostCents: number;
}

export function CostBreakdown({
  byProvider,
  byModel,
  totalCostCents,
}: CostBreakdownProps) {
  const maxProviderCost = Math.max(
    ...byProvider.map((p) => p._sum.costCents ?? 0),
    1,
  );

  const topModels = byModel.slice(0, 10);
  const maxModelCost = Math.max(
    ...topModels.map((m) => m._sum.costCents ?? 0),
    1,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* By Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          {byProvider.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cost data yet.</p>
          ) : (
            <div className="space-y-3">
              {byProvider.map((item) => {
                const cost = item._sum.costCents ?? 0;
                const pct = totalCostCents > 0 ? (cost / totalCostCents) * 100 : 0;
                const barWidth = (cost / maxProviderCost) * 100;
                const color =
                  PROVIDER_COLORS[item.provider] ?? PROVIDER_COLORS.CUSTOM;

                return (
                  <div key={item.provider}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{item.provider}</span>
                      <span className="text-muted-foreground">
                        {formatCents(cost)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                      <span>
                        {(item._sum.inputTokens ?? 0).toLocaleString()} in /{" "}
                        {(item._sum.outputTokens ?? 0).toLocaleString()} out
                      </span>
                      <span>{item._count.id} events</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Model */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost by Model</CardTitle>
        </CardHeader>
        <CardContent>
          {topModels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cost data yet.</p>
          ) : (
            <div className="space-y-3">
              {topModels.map((item) => {
                const cost = item._sum.costCents ?? 0;
                const barWidth = (cost / maxModelCost) * 100;
                const color =
                  PROVIDER_COLORS[item.provider] ?? PROVIDER_COLORS.CUSTOM;

                return (
                  <div key={`${item.provider}-${item.model}`}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium truncate mr-2">
                        {item.model}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {formatCents(cost)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                      <span>{item.provider}</span>
                      <span>{item._count.id} events</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
