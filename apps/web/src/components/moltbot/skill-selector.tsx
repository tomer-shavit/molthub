"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Puzzle, Check } from "lucide-react";

export interface SkillItem {
  id: string;
  name: string;
  description?: string;
  version?: string;
  enabled: boolean;
  category?: string;
}

interface SkillSelectorProps {
  skills: SkillItem[];
  onToggle?: (skillId: string, enabled: boolean) => void;
  className?: string;
}

export function SkillSelector({ skills, onToggle, className }: SkillSelectorProps) {
  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Puzzle className="w-4 h-4" />
            Skills
          </CardTitle>
          <Badge variant="secondary">
            {enabledCount} / {skills.length} enabled
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Puzzle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No skills available.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} onToggle={onToggle} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillRow({
  skill,
  onToggle,
}: {
  skill: SkillItem;
  onToggle?: (skillId: string, enabled: boolean) => void;
}) {
  const handleToggle = useCallback(() => {
    onToggle?.(skill.id, !skill.enabled);
  }, [skill.id, skill.enabled, onToggle]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        skill.enabled ? "bg-background" : "bg-muted/50 opacity-70"
      )}
    >
      <button
        onClick={handleToggle}
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
          skill.enabled
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary/50"
        )}
      >
        {skill.enabled && <Check className="w-3 h-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{skill.name}</span>
          {skill.version && (
            <span className="text-xs text-muted-foreground font-mono">v{skill.version}</span>
          )}
          {skill.category && (
            <Badge variant="outline" className="text-xs">
              {skill.category}
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
        )}
      </div>
    </div>
  );
}
