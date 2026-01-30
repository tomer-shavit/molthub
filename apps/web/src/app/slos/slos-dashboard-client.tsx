"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SloCard } from "@/components/slos/slo-card";
import { SloForm } from "@/components/slos/slo-form";
import { api, type SloDefinition, type SloSummary } from "@/lib/api";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Plus,
} from "lucide-react";

interface SlosDashboardClientProps {
  initialSlos: SloDefinition[];
  initialSummary: SloSummary;
}

export function SlosDashboardClient({
  initialSlos,
  initialSummary,
}: SlosDashboardClientProps) {
  const [slos, setSlos] = useState<SloDefinition[]>(initialSlos);
  const [summary, setSummary] = useState<SloSummary>(initialSummary);
  const [showForm, setShowForm] = useState(false);
  const [filterBreached, setFilterBreached] = useState<string>("all");
  const [filterInstance, setFilterInstance] = useState<string>("all");

  // Get unique instance names for filter
  const instanceNames = Array.from(
    new Map(
      slos
        .filter((s) => s.instance)
        .map((s) => [s.instance!.id, s.instance!.name])
    )
  );

  const filteredSlos = slos.filter((slo) => {
    if (filterBreached === "breached" && !slo.isBreached) return false;
    if (filterBreached === "healthy" && slo.isBreached) return false;
    if (filterInstance !== "all" && slo.instanceId !== filterInstance)
      return false;
    return true;
  });

  async function refreshData() {
    try {
      const [newSlos, newSummary] = await Promise.all([
        api.listSlos(),
        api.getSloSummary(),
      ]);
      setSlos(newSlos);
      setSummary(newSummary);
    } catch {
      // Ignore refresh errors
    }
  }

  function handleCreateSuccess() {
    setShowForm(false);
    refreshData();
  }

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SLO Tracking</h1>
          <p className="text-muted-foreground mt-1">
            Monitor Service Level Objectives across your bot instances
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? "Close Form" : "Create SLO"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total SLOs</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <p className="text-xs text-muted-foreground">Active definitions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Breached</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {summary.breached}
            </div>
            <p className="text-xs text-muted-foreground">
              Requires attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {summary.healthy}
            </div>
            <p className="text-xs text-muted-foreground">Meeting targets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.compliancePercent}%
            </div>
            <p className="text-xs text-muted-foreground">
              Overall compliance rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="mb-8">
          <SloForm
            onSuccess={handleCreateSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select
            value={filterBreached}
            onChange={(e) => setFilterBreached(e.target.value)}
            className="w-40"
          >
            <option value="all">All</option>
            <option value="breached">Breached</option>
            <option value="healthy">Healthy</option>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Instance
          </label>
          <Select
            value={filterInstance}
            onChange={(e) => setFilterInstance(e.target.value)}
            className="w-48"
          >
            <option value="all">All Instances</option>
            {instanceNames.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* SLO Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSlos.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="pt-6 text-center py-12">
              <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {slos.length === 0
                  ? "No SLO definitions yet. Create your first SLO to start tracking."
                  : "No SLOs match the current filters."}
              </p>
              {slos.length === 0 && (
                <Button className="mt-4" onClick={() => setShowForm(true)}>
                  Create your first SLO
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredSlos.map((slo) => <SloCard key={slo.id} slo={slo} />)
        )}
      </div>
    </div>
  );
}
