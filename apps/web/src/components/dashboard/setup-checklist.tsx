"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserStage } from "@/lib/user-stage-context";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Bot,
  MessageSquare,
  Layers,
  Rocket,
} from "lucide-react";

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
  icon: React.ReactNode;
}

export function SetupChecklist() {
  const { agentCount, hasFleets } = useUserStage();
  const [hasChannels, setHasChannels] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const bots = await api.listBotInstances();
        const anyChannels = bots.some((bot) => {
          const manifest = bot.desiredManifest as Record<string, unknown> | null;
          const spec = (manifest?.spec as Record<string, unknown>) || manifest;
          const config = (spec?.moltbotConfig as Record<string, unknown>) || spec;
          const channels = (config?.channels as Record<string, unknown>) || {};
          return Object.keys(channels).length > 0;
        });
        setHasChannels(anyChannels);
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    }
    check();
  }, []);

  if (!loaded) return null;

  const steps: ChecklistStep[] = [
    {
      id: "deploy",
      label: "Deploy your first bot",
      description: "Create and deploy an OpenClaw agent.",
      completed: agentCount > 0,
      href: "/bots/new",
      icon: <Bot className="w-4 h-4" />,
    },
    {
      id: "channel",
      label: "Add a messaging channel",
      description: "Connect WhatsApp, Telegram, Discord, or Slack.",
      completed: hasChannels,
      href: "/channels",
      icon: <MessageSquare className="w-4 h-4" />,
    },
    {
      id: "fleet",
      label: "Organize into a fleet",
      description: "Group your bots for easier management.",
      completed: hasFleets,
      href: "/fleets/new",
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: "another",
      label: "Deploy another bot",
      description: "Scale up with a second agent.",
      completed: agentCount >= 2,
      href: "/bots/new",
      icon: <Rocket className="w-4 h-4" />,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;

  // Hide if all steps completed
  if (completedCount === steps.length) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Getting Started</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{steps.length} completed
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {step.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={step.completed ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
                  {step.label}
                </p>
                {!step.completed && (
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                )}
              </div>
              {!step.completed && (
                <Link href={step.href}>
                  <Button variant="outline" size="sm" className="flex-shrink-0">
                    {step.icon}
                    <span className="ml-1.5">Start</span>
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
