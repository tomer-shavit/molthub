"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitCompare, ChevronDown, ChevronUp } from "lucide-react";

interface EvolutionChange {
  category: string;
  field: string;
  changeType: "added" | "removed" | "modified";
  deployedValue?: unknown;
  liveValue?: unknown;
}

interface EvolutionDiffProps {
  deployedConfig: Record<string, unknown>;
  liveConfig: Record<string, unknown>;
  changes: EvolutionChange[];
  className?: string;
}

export function EvolutionDiff({
  deployedConfig,
  liveConfig,
  changes,
  className,
}: EvolutionDiffProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Group changes by category
  const groupedChanges = changes.reduce(
    (acc, change) => {
      const key = change.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(change);
      return acc;
    },
    {} as Record<string, EvolutionChange[]>,
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (changes.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <GitCompare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No differences detected</p>
            <p className="text-sm">The live config matches the deployed config</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="w-4 h-4" />
            Evolution Summary
            <Badge variant="secondary" className="ml-auto">
              {changes.length} change{changes.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(groupedChanges).map(([category, catChanges]) => {
              const added = catChanges.filter((c) => c.changeType === "added").length;
              const removed = catChanges.filter((c) => c.changeType === "removed").length;
              const modified = catChanges.filter((c) => c.changeType === "modified").length;

              return (
                <Badge key={category} variant="outline" className="gap-1 py-1">
                  <span className="font-medium capitalize">{category}</span>
                  {added > 0 && <span className="text-green-600">+{added}</span>}
                  {removed > 0 && <span className="text-red-600">-{removed}</span>}
                  {modified > 0 && <span className="text-yellow-600">~{modified}</span>}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Per-category details */}
      {Object.entries(groupedChanges).map(([category, catChanges]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base capitalize flex items-center gap-2">
                {category}
                <Badge variant="secondary" className="text-xs">
                  {catChanges.length}
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleSection(category)}
              >
                {expandedSections.has(category) ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardHeader>

          {expandedSections.has(category) && (
            <CardContent>
              <div className="space-y-3">
                {catChanges.map((change, i) => (
                  <div
                    key={`${change.field}-${i}`}
                    className={`rounded border p-3 text-sm ${
                      change.changeType === "added"
                        ? "border-green-200 bg-green-50/50"
                        : change.changeType === "removed"
                          ? "border-red-200 bg-red-50/50"
                          : "border-yellow-200 bg-yellow-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-medium">{change.field}</span>
                      <Badge
                        variant="outline"
                        className={
                          change.changeType === "added"
                            ? "text-green-700 border-green-300"
                            : change.changeType === "removed"
                              ? "text-red-700 border-red-300"
                              : "text-yellow-700 border-yellow-300"
                        }
                      >
                        {change.changeType}
                      </Badge>
                    </div>

                    {change.changeType === "modified" && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Deployed</p>
                          <pre className="text-xs bg-red-50 rounded p-2 overflow-auto max-h-32 border border-red-100">
                            {formatValue(change.deployedValue)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Live</p>
                          <pre className="text-xs bg-green-50 rounded p-2 overflow-auto max-h-32 border border-green-100">
                            {formatValue(change.liveValue)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {change.changeType === "added" && change.liveValue !== undefined && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Value</p>
                        <pre className="text-xs bg-green-50 rounded p-2 overflow-auto max-h-32 border border-green-100">
                          {formatValue(change.liveValue)}
                        </pre>
                      </div>
                    )}

                    {change.changeType === "removed" && change.deployedValue !== undefined && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Was</p>
                        <pre className="text-xs bg-red-50 rounded p-2 overflow-auto max-h-32 border border-red-100">
                          {formatValue(change.deployedValue)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
