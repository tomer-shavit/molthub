"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AlertCard } from "@/components/alerts/alert-card";
import {
  api,
  type HealthAlert,
  type HealthAlertSeverity,
  type HealthAlertStatus,
} from "@/lib/api";
import { RefreshCw, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AlertsListProps {
  initialAlerts: HealthAlert[];
  initialTotal: number;
  filters: {
    severity?: string;
    status?: string;
    instanceId?: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertsList({
  initialAlerts,
  initialTotal,
  filters,
}: AlertsListProps) {
  const [alerts, setAlerts] = useState<HealthAlert[]>(initialAlerts);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState(
    filters.severity ?? "all",
  );
  const [statusFilter, setStatusFilter] = useState(filters.status ?? "all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listAlerts({
        severity:
          severityFilter !== "all"
            ? (severityFilter as HealthAlertSeverity)
            : undefined,
        status:
          statusFilter !== "all"
            ? (statusFilter as HealthAlertStatus)
            : undefined,
        instanceId: filters.instanceId,
        limit: 25,
      });
      setAlerts(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to refresh alerts:", err);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter, filters.instanceId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>
              {total} alert{total !== 1 ? "s" : ""} found
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="w-[160px]">
            <Select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
              }}
            >
              <option value="all">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="ERROR">Error</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
              <option value="SUPPRESSED">Suppressed</option>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Apply Filters
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No alerts found</p>
            <p className="text-sm mt-1">
              Your Moltbot fleet is running smoothly.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onUpdate={refresh} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
