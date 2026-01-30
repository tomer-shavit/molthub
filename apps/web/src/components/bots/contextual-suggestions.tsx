"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  MessageSquare,
  Puzzle,
  Stethoscope,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { BotInstance } from "@/lib/api";

interface Suggestion {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  label: string;
}

interface ContextualSuggestionsProps {
  bot: BotInstance;
}

function getSuggestions(bot: BotInstance): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Check channel count from manifest
  const manifest = bot.desiredManifest as Record<string, unknown> | null;
  const spec = (manifest?.spec as Record<string, unknown>) || manifest;
  const moltbotConfig = (spec?.moltbotConfig as Record<string, unknown>) || spec;
  const channelsConfig = (moltbotConfig?.channels as Record<string, unknown>) || {};
  const channelCount = Object.keys(channelsConfig).length;

  // Check skills
  const skillsConfig = (moltbotConfig?.skills as Record<string, unknown>) || {};
  const skillEntries = (skillsConfig?.entries as Record<string, unknown>) || {};
  const bundledSkills = (skillsConfig?.allowBundled as string[]) || [];
  const hasSkills = Object.keys(skillEntries).length > 0 || bundledSkills.length > 0;

  if (channelCount === 0) {
    suggestions.push({
      icon: MessageSquare,
      title: "Add a messaging channel",
      description: "Connect WhatsApp, Telegram, Discord, or other channels.",
      href: `/bots/${bot.id}?tab=channels`,
      label: "Add Channel",
    });
  }

  if (!hasSkills) {
    suggestions.push({
      icon: Puzzle,
      title: "Configure skills",
      description: "Enable bundled skills or add custom ones.",
      href: `/bots/${bot.id}?tab=skills`,
      label: "Configure",
    });
  }

  if (bot.health === "UNKNOWN" || bot.health === "UNHEALTHY") {
    suggestions.push({
      icon: Stethoscope,
      title: "Run diagnostics",
      description: "Check what's happening with your bot.",
      href: `/bots/${bot.id}`,
      label: "Diagnose",
    });
  }

  if (bot.status === "RUNNING" && bot.health === "HEALTHY") {
    suggestions.push({
      icon: Plus,
      title: "Deploy another bot",
      description: "Scale your fleet with another agent.",
      href: "/bots/new",
      label: "Deploy",
    });
  }

  return suggestions.slice(0, 3);
}

export function ContextualSuggestions({ bot }: ContextualSuggestionsProps) {
  const suggestions = getSuggestions(bot);

  if (suggestions.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3 mt-6">
      {suggestions.map((suggestion) => {
        const Icon = suggestion.icon;
        return (
          <Card key={suggestion.title} className="border-dashed">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium">{suggestion.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {suggestion.description}
                  </p>
                  <Link href={suggestion.href}>
                    <Button variant="link" size="sm" className="px-0 h-auto mt-1 text-xs">
                      {suggestion.label}
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
