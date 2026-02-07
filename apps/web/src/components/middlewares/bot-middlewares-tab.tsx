"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Puzzle, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { middlewaresClient } from "@/lib/api";
import type {
  BotInstance,
  MiddlewareRegistryEntry,
  BotMiddlewareAssignment,
} from "@/lib/api";
import { MiddlewareAssignDialog } from "./middleware-assign-dialog";
import { hookColors } from "./constants";

interface BotMiddlewaresTabProps {
  bot: BotInstance;
}

export function BotMiddlewaresTab({ bot }: BotMiddlewaresTabProps) {
  const [assignments, setAssignments] = useState<BotMiddlewareAssignment[]>([]);
  const [registry, setRegistry] = useState<MiddlewareRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedMiddleware, setSelectedMiddleware] =
    useState<MiddlewareRegistryEntry | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [assignmentsData, registryData] = await Promise.all([
        middlewaresClient.getBotMiddlewares(bot.id),
        middlewaresClient.list(),
      ]);
      setAssignments(assignmentsData);
      setRegistry(registryData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load middlewares");
    } finally {
      setLoading(false);
    }
  }, [bot.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (pkg: string, enabled: boolean) => {
    setToggling(pkg);
    try {
      const updated = await middlewaresClient.updateAssignment(
        bot.id,
        pkg,
        { enabled },
      );
      setAssignments(updated);
    } catch {
      // Revert on failure — re-fetch
      await loadData();
    } finally {
      setToggling(null);
    }
  };

  const handleRemove = async (pkg: string) => {
    setRemoving(pkg);
    try {
      await middlewaresClient.removeFromBot(bot.id, pkg);
      setAssignments((prev) => prev.filter((a) => a.package !== pkg));
    } catch {
      await loadData();
    } finally {
      setRemoving(null);
    }
  };

  const getRegistryEntry = (pkg: string) =>
    registry.find((r) => r.id === pkg);

  const handleAddClick = () => {
    // Pick the first unassigned middleware from registry for the dialog
    const unassigned = registry.find(
      (r) => !assignments.some((a) => a.package === r.id),
    );
    if (unassigned) {
      setSelectedMiddleware(unassigned);
      setAssignDialogOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive/50 mb-3" />
          <p className="text-sm font-medium">Failed to load middlewares</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              setLoading(true);
              loadData();
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Assigned Middlewares
          </CardTitle>
          {registry.length > assignments.length && (
            <Button size="sm" variant="outline" onClick={handleAddClick}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Middleware
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Puzzle className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">No middlewares assigned</p>
              <p className="text-sm text-muted-foreground mt-1">
                Assign a middleware to intercept this bot&apos;s traffic
              </p>
              {registry.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={handleAddClick}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Middleware
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => {
                const entry = getRegistryEntry(assignment.package);
                return (
                  <div
                    key={assignment.package}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {entry?.emoji ? (
                        <span className="text-xl">{entry.emoji}</span>
                      ) : (
                        <Puzzle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {entry?.displayName ?? assignment.package}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {entry?.hooks.map((hook) => (
                            <Badge
                              key={hook}
                              variant="outline"
                              className={`text-xs ${hookColors[hook] ?? ""}`}
                            >
                              {hook}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant={assignment.enabled ? "default" : "outline"}
                        size="sm"
                        disabled={toggling === assignment.package}
                        onClick={() =>
                          handleToggle(assignment.package, !assignment.enabled)
                        }
                      >
                        {toggling === assignment.package ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : assignment.enabled ? (
                          "Enabled"
                        ) : (
                          "Disabled"
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove middleware ${entry?.displayName ?? assignment.package}`}
                        disabled={removing === assignment.package}
                        onClick={() => handleRemove(assignment.package)}
                      >
                        {removing === assignment.package ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedMiddleware && (
        <MiddlewareAssignDialog
          middleware={selectedMiddleware}
          open={assignDialogOpen}
          onOpenChange={(open) => {
            setAssignDialogOpen(open);
            if (!open) {
              loadData();
            }
          }}
        />
      )}
    </>
  );
}
