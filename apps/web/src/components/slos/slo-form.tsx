"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  api,
  type BotInstance,
  type CreateSloPayload,
  type SloMetric,
  type SloWindow,
} from "@/lib/api";

const METRIC_OPTIONS: { value: SloMetric; label: string }[] = [
  { value: "UPTIME", label: "Uptime (%)" },
  { value: "LATENCY_P50", label: "Latency P50 (ms)" },
  { value: "LATENCY_P95", label: "Latency P95 (ms)" },
  { value: "LATENCY_P99", label: "Latency P99 (ms)" },
  { value: "ERROR_RATE", label: "Error Rate (%)" },
  { value: "CHANNEL_HEALTH", label: "Channel Health (%)" },
];

const WINDOW_OPTIONS: { value: SloWindow; label: string }[] = [
  { value: "ROLLING_1H", label: "Rolling 1 Hour" },
  { value: "ROLLING_24H", label: "Rolling 24 Hours" },
  { value: "ROLLING_7D", label: "Rolling 7 Days" },
  { value: "ROLLING_30D", label: "Rolling 30 Days" },
  { value: "CALENDAR_DAY", label: "Calendar Day" },
  { value: "CALENDAR_WEEK", label: "Calendar Week" },
  { value: "CALENDAR_MONTH", label: "Calendar Month" },
];

interface SloFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SloForm({ onSuccess, onCancel }: SloFormProps) {
  const [instances, setInstances] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [metric, setMetric] = useState<SloMetric>("UPTIME");
  const [targetValue, setTargetValue] = useState<string>("99.9");
  const [window, setWindow] = useState<SloWindow>("ROLLING_24H");

  useEffect(() => {
    api.listBotInstances().then(setInstances).catch(() => {
      // Ignore errors loading instances
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!instanceId) {
      setError("Please select a bot instance");
      return;
    }
    const parsedTarget = parseFloat(targetValue);
    if (isNaN(parsedTarget) || parsedTarget <= 0) {
      setError("Target value must be a positive number");
      return;
    }

    setLoading(true);
    try {
      const payload: CreateSloPayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        instanceId,
        metric,
        targetValue: parsedTarget,
        window,
      };
      await api.createSlo(payload);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create SLO");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create SLO Definition</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="slo-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="slo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., API Uptime SLO"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="slo-description" className="text-sm font-medium">
              Description (optional)
            </label>
            <Input
              id="slo-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Ensure 99.9% uptime for production bot"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="slo-instance" className="text-sm font-medium">
              Bot Instance
            </label>
            <Select
              id="slo-instance"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              required
            >
              <option value="">Select instance...</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="slo-metric" className="text-sm font-medium">
              Metric
            </label>
            <Select
              id="slo-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as SloMetric)}
            >
              {METRIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="slo-target" className="text-sm font-medium">
              Target Value
            </label>
            <Input
              id="slo-target"
              type="number"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g., 99.9"
              required
            />
            <p className="text-xs text-muted-foreground">
              {metric === "UPTIME" || metric === "CHANNEL_HEALTH"
                ? "Percentage (higher is better)"
                : metric === "ERROR_RATE"
                  ? "Percentage (lower is better)"
                  : "Milliseconds (lower is better)"}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="slo-window" className="text-sm font-medium">
              Window
            </label>
            <Select
              id="slo-window"
              value={window}
              onChange={(e) => setWindow(e.target.value as SloWindow)}
            >
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create SLO"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
