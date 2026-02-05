"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Calendar, Clock } from "lucide-react";
import { costsClient, type CostSummary } from "@/lib/api";
import Link from "next/link";

interface CostPeriod {
  label: string;
  from: string;
  to: string;
  icon: React.ReactNode;
}

function getDateRanges(): { today: CostPeriod; month: CostPeriod } {
  const now = new Date();

  // Today: start of day UTC to now
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // This month: start of month UTC to now
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return {
    today: {
      label: "Today",
      from: todayStart.toISOString(),
      to: now.toISOString(),
      icon: <Clock className="w-4 h-4" />,
    },
    month: {
      label: "This Month",
      from: monthStart.toISOString(),
      to: now.toISOString(),
      icon: <Calendar className="w-4 h-4" />,
    },
  };
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function CostSummaryCard() {
  const [loading, setLoading] = useState(true);
  const [todayCosts, setTodayCosts] = useState<CostSummary | null>(null);
  const [monthCosts, setMonthCosts] = useState<CostSummary | null>(null);

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const ranges = getDateRanges();
        const [today, month] = await Promise.all([
          costsClient.getSummary({ from: ranges.today.from, to: ranges.today.to }),
          costsClient.getSummary({ from: ranges.month.from, to: ranges.month.to }),
        ]);
        setTodayCosts(today);
        setMonthCosts(month);
      } catch {
        // Silently handle errors - show empty state
      } finally {
        setLoading(false);
      }
    };

    fetchCosts();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasCosts = (todayCosts?.totalCostCents ?? 0) > 0 || (monthCosts?.totalCostCents ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Cost Summary
          </CardTitle>
          <Link
            href="/costs"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View details →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {!hasCosts ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No cost data available yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Today's costs */}
            <div className="space-y-1 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Today
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {formatCost(todayCosts?.totalCostCents ?? 0)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatTokens((todayCosts?.totalInputTokens ?? 0) + (todayCosts?.totalOutputTokens ?? 0))} tokens</span>
                <span>·</span>
                <span>{todayCosts?.totalEvents ?? 0} events</span>
              </div>
            </div>

            {/* This month's costs */}
            <div className="space-y-1 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                This Month
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {formatCost(monthCosts?.totalCostCents ?? 0)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatTokens((monthCosts?.totalInputTokens ?? 0) + (monthCosts?.totalOutputTokens ?? 0))} tokens</span>
                <span>·</span>
                <span>{monthCosts?.totalEvents ?? 0} events</span>
              </div>
            </div>
          </div>
        )}

        {/* Top providers (if any) */}
        {monthCosts && monthCosts.byProvider.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <TrendingUp className="w-3 h-3" />
              Top Providers (This Month)
            </div>
            <div className="space-y-2">
              {monthCosts.byProvider.slice(0, 3).map((provider) => {
                const costCents = provider._sum.costCents ?? 0;
                const percentage = monthCosts.totalCostCents > 0
                  ? Math.round((costCents / monthCosts.totalCostCents) * 100)
                  : 0;
                return (
                  <div key={provider.provider} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{provider.provider}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">{formatCost(costCents)}</span>
                      <span className="text-xs text-muted-foreground w-8 text-right">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
