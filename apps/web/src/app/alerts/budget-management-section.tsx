"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  api,
  type BudgetConfig,
  type CreateBudgetPayload,
  type BotInstance,
} from "@/lib/api";
import {
  DollarSign,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Budget form
// ---------------------------------------------------------------------------

function BudgetForm({
  initial,
  botInstances,
  onSave,
  onCancel,
}: {
  initial?: BudgetConfig;
  botInstances: BotInstance[];
  onSave: (data: CreateBudgetPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [instanceId, setInstanceId] = useState(initial?.instanceId ?? "");
  const [monthlyLimit, setMonthlyLimit] = useState(
    initial ? (initial.monthlyLimitCents / 100).toString() : "",
  );
  const [warnPct, setWarnPct] = useState(
    (initial?.warnThresholdPct ?? 75).toString(),
  );
  const [critPct, setCritPct] = useState(
    (initial?.criticalThresholdPct ?? 90).toString(),
  );
  // Daily limit fields
  const [enableDailyLimit, setEnableDailyLimit] = useState(
    initial?.dailyLimitCents != null && initial.dailyLimitCents > 0,
  );
  const [dailyLimit, setDailyLimit] = useState(
    initial?.dailyLimitCents ? (initial.dailyLimitCents / 100).toString() : "",
  );
  const [dailyWarnPct, setDailyWarnPct] = useState(
    (initial?.dailyWarnThresholdPct ?? 75).toString(),
  );
  const [dailyCritPct, setDailyCritPct] = useState(
    (initial?.dailyCriticalThresholdPct ?? 90).toString(),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: CreateBudgetPayload = {
        name,
        monthlyLimitCents: Math.round(parseFloat(monthlyLimit) * 100),
        warnThresholdPct: parseInt(warnPct, 10),
        criticalThresholdPct: parseInt(critPct, 10),
      };

      if (instanceId) {
        payload.instanceId = instanceId;
      }

      if (enableDailyLimit && dailyLimit) {
        payload.dailyLimitCents = Math.round(parseFloat(dailyLimit) * 100);
        payload.dailyWarnThresholdPct = parseInt(dailyWarnPct, 10);
        payload.dailyCriticalThresholdPct = parseInt(dailyCritPct, 10);
      }

      await onSave(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save budget";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/30">
      {error && (
        <div className="text-sm text-red-500 p-2 bg-red-50 rounded">{error}</div>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production Bot Budget"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Bot Instance (optional)</label>
          <select
            className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
          >
            <option value="">All instances (workspace-wide)</option>
            {botInstances.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Monthly Limits */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="w-4 h-4" />
          Monthly Budget
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Limit ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              placeholder="100.00"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Warning %</label>
            <input
              type="number"
              min="1"
              max="100"
              className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
              value={warnPct}
              onChange={(e) => setWarnPct(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Critical %</label>
            <input
              type="number"
              min="1"
              max="100"
              className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
              value={critPct}
              onChange={(e) => setCritPct(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Daily Limits Toggle */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableDailyLimit}
            onChange={(e) => setEnableDailyLimit(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="w-4 h-4" />
            Enable Daily Budget Limit
          </span>
        </label>

        {enableDailyLimit && (
          <div className="grid grid-cols-3 gap-3 pl-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Daily Limit ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="10.00"
                required={enableDailyLimit}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Warning %</label>
              <input
                type="number"
                min="1"
                max="100"
                className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
                value={dailyWarnPct}
                onChange={(e) => setDailyWarnPct(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Critical %</label>
              <input
                type="number"
                min="1"
                max="100"
                className="w-full mt-1 px-3 py-1.5 text-sm border rounded bg-background"
                value={dailyCritPct}
                onChange={(e) => setDailyCritPct(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !name || !monthlyLimit}>
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Budget row
// ---------------------------------------------------------------------------

function BudgetRow({
  budget,
  botInstances,
  onEdit,
  onDelete,
}: {
  budget: BudgetConfig;
  botInstances: BotInstance[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const monthlySpendPct =
    budget.monthlyLimitCents > 0
      ? (budget.currentSpendCents / budget.monthlyLimitCents) * 100
      : 0;

  const dailySpendPct =
    budget.dailyLimitCents && budget.dailyLimitCents > 0
      ? (budget.currentDailySpendCents / budget.dailyLimitCents) * 100
      : 0;

  const getBarColor = (pct: number, warnPct: number, critPct: number) => {
    if (pct >= critPct) return "bg-red-500";
    if (pct >= warnPct) return "bg-yellow-500";
    return "bg-green-500";
  };

  const monthlyBarColor = getBarColor(
    monthlySpendPct,
    budget.warnThresholdPct,
    budget.criticalThresholdPct,
  );

  const dailyBarColor = budget.dailyLimitCents
    ? getBarColor(
        dailySpendPct,
        budget.dailyWarnThresholdPct ?? 75,
        budget.dailyCriticalThresholdPct ?? 90,
      )
    : "";

  const botName = budget.instanceId
    ? botInstances.find((b) => b.id === budget.instanceId)?.name
    : null;

  return (
    <div className="flex items-start gap-4 p-3 border rounded-lg">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{budget.name}</span>
          {botName && (
            <Badge variant="outline" className="text-xs">
              {botName}
            </Badge>
          )}
          {!budget.isActive && (
            <Badge variant="secondary" className="text-xs">Inactive</Badge>
          )}
        </div>

        {/* Monthly progress */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            Monthly
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${monthlyBarColor}`}
                style={{ width: `${Math.min(monthlySpendPct, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              ${(budget.currentSpendCents / 100).toFixed(2)} / $
              {(budget.monthlyLimitCents / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Daily progress (if enabled) */}
        {budget.dailyLimitCents && budget.dailyLimitCents > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              Daily
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${dailyBarColor}`}
                  style={{ width: `${Math.min(dailySpendPct, 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                ${(budget.currentDailySpendCents / 100).toFixed(2)} / $
                {(budget.dailyLimitCents / 100).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit2 className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="w-3 h-3 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function BudgetManagementSection() {
  const [budgets, setBudgets] = useState<BudgetConfig[]>([]);
  const [botInstances, setBotInstances] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [budgetsData, botsData] = await Promise.all([
        api.listBudgets(),
        api.listBotInstances(),
      ]);
      setBudgets(budgetsData);
      setBotInstances(botsData);
    } catch {
      // Error is handled by showing empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (data: CreateBudgetPayload) => {
    await api.createBudget(data);
    setShowForm(false);
    await fetchData();
  };

  const handleUpdate = async (id: string, data: CreateBudgetPayload) => {
    await api.updateBudget(id, data);
    setEditingId(null);
    await fetchData();
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteBudget(id);
      await fetchData();
    } catch {
      // Error is silently handled - budget remains in list
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Budget Alerts</CardTitle>
              <CardDescription>
                Set monthly and daily spending limits to trigger alerts when thresholds are reached
              </CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-3 h-3 mr-1" />
              Add Budget
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <BudgetForm
            botInstances={botInstances}
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Loading budgets...
          </div>
        ) : budgets.length === 0 && !showForm ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No budgets configured. Add one to start tracking spend thresholds.
          </div>
        ) : (
          budgets.map((budget) =>
            editingId === budget.id ? (
              <BudgetForm
                key={budget.id}
                initial={budget}
                botInstances={botInstances}
                onSave={(data) => handleUpdate(budget.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <BudgetRow
                key={budget.id}
                budget={budget}
                botInstances={botInstances}
                onEdit={() => setEditingId(budget.id)}
                onDelete={() => handleDelete(budget.id)}
              />
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}
