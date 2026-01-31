"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, BotInstance } from "@/lib/api";
import {
  ChannelMatrix,
  BotChannelRow,
  ChannelStatus,
} from "@/components/channels/channel-matrix";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Radio, MessageSquare } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

const CHANNEL_TYPES = [
  "whatsapp",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "mattermost",
  "google-chat",
  "ms-teams",
  "line",
  "matrix",
];

function deriveChannelStatus(
  bot: BotInstance,
  channelType: string
): { status: ChannelStatus; details?: string; channelId?: string } {
  // Check bot metadata and connector bindings for channel info
  const metadata = bot.metadata as Record<string, unknown> | null;
  const channels = metadata?.channels as Record<string, unknown> | undefined;

  if (channels && channels[channelType]) {
    const chConfig = channels[channelType] as Record<string, unknown>;
    if (chConfig.enabled === false) {
      return { status: "inactive", details: "Disabled" };
    }
    // If the bot is running and channel is enabled, consider it active
    if (bot.status === "RUNNING" || bot.status === "RECONCILING") {
      return {
        status: "active",
        details: `DM: ${(chConfig.dmPolicy as string) || "pairing"}`,
      };
    }
    if (bot.status === "ERROR" || bot.health === "UNHEALTHY") {
      return { status: "error", details: bot.lastError || "Bot unhealthy" };
    }
    return { status: "inactive", details: `Bot ${bot.status.toLowerCase()}` };
  }

  // Check if desiredManifest has channel config
  const manifest = bot.desiredManifest as Record<string, unknown> | null;
  if (manifest) {
    const spec = manifest.spec as Record<string, unknown> | undefined;
    const manifestChannels = spec?.channels as Record<string, unknown> | undefined;
    if (manifestChannels && manifestChannels[channelType]) {
      const chConfig = manifestChannels[channelType] as Record<string, unknown>;
      if (chConfig.enabled === false) {
        return { status: "inactive", details: "Disabled in manifest" };
      }
      if (bot.status === "RUNNING") {
        return { status: "active", details: "From manifest" };
      }
      return { status: "inactive", details: `Bot ${bot.status.toLowerCase()}` };
    }
  }

  return { status: "not_configured" };
}

export default function ChannelsPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listBotInstances()
      .then((data) => {
        setBots(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const matrixRows: BotChannelRow[] = bots.map((bot) => ({
    botId: bot.id,
    botName: bot.name,
    channels: CHANNEL_TYPES.reduce(
      (acc, type) => {
        acc[type] = deriveChannelStatus(bot, type);
        return acc;
      },
      {} as Record<string, { status: ChannelStatus; details?: string; channelId?: string }>
    ),
  }));

  const handleCellClick = (botId: string, channelType: string, channelId?: string) => {
    router.push(`/bots/${botId}?tab=channels&channel=${channelType}`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Loading channel data...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="w-6 h-6" />
          Channel Matrix
        </h1>
        <p className="text-muted-foreground">
          Overview of all channel bindings across bot instances
        </p>
      </div>

      {bots.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={MessageSquare}
              title="No channels configured"
              description="Deploy a bot first, then configure its messaging channels."
              action={{ label: "Deploy a Bot", href: "/bots/new" }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Bot Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelMatrix
              bots={matrixRows}
              channelTypes={CHANNEL_TYPES}
              onCellClick={handleCellClick}
            />
          </CardContent>
        </Card>
      )}
    </div>
    </DashboardLayout>
  );
}
