"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Send,
  Gamepad2,
  Hash,
  MessageSquare,
  Info,
} from "lucide-react";

export interface TemplateChannelPreset {
  type: string;
  enabled: boolean;
  defaults: Record<string, unknown>;
}

export interface ChannelConfig {
  type: string;
  config: Record<string, unknown>;
}

interface ChannelSetupStepProps {
  templateChannels: TemplateChannelPreset[];
  channelConfigs: ChannelConfig[];
  onChannelChange: (channels: ChannelConfig[]) => void;
}

const channelIconMap: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-5 h-5" />,
  telegram: <Send className="w-5 h-5" />,
  discord: <Gamepad2 className="w-5 h-5" />,
  slack: <Hash className="w-5 h-5" />,
};

function getChannelIcon(type: string): React.ReactNode {
  return channelIconMap[type.toLowerCase()] || <MessageSquare className="w-5 h-5" />;
}

export function ChannelSetupStep({
  templateChannels,
  channelConfigs,
  onChannelChange,
}: ChannelSetupStepProps) {
  // Only whatsapp and telegram support dmPolicy
  const supportsDmPolicy = (type: string) => ["whatsapp", "telegram"].includes(type.toLowerCase());

  const getConfigForChannel = (type: string): ChannelConfig => {
    const defaultConfig = supportsDmPolicy(type)
      ? { enabled: false, dmPolicy: "pairing" }
      : { enabled: false };
    return channelConfigs.find((c) => c.type === type) || { type, config: defaultConfig };
  };

  const updateChannel = (type: string, updates: Record<string, unknown>) => {
    const existing = getConfigForChannel(type);
    const updated: ChannelConfig = {
      ...existing,
      config: { ...existing.config, ...updates },
    };

    const newConfigs = channelConfigs.some((c) => c.type === type)
      ? channelConfigs.map((c) => (c.type === type ? updated : c))
      : [...channelConfigs, updated];

    onChannelChange(newConfigs);
  };

  return (
    <div className="space-y-4">
      {templateChannels.map((preset) => {
        const channelConfig = getConfigForChannel(preset.type);
        const isEnabled = channelConfig.config.enabled !== false;

        return (
          <Card key={preset.type} className={cn(!isEnabled && "opacity-60")}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {getChannelIcon(preset.type)}
                  <span className="capitalize">{preset.type}</span>
                </CardTitle>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-muted-foreground">
                    {isEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      isEnabled ? "bg-primary" : "bg-muted"
                    )}
                    onClick={() =>
                      updateChannel(preset.type, { enabled: !isEnabled })
                    }
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform",
                        isEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {isEnabled && (
                <div className="space-y-4">
                  <ChannelFields
                    type={preset.type}
                    config={channelConfig.config}
                    onUpdate={(updates) => updateChannel(preset.type, updates)}
                  />

                  {supportsDmPolicy(preset.type) && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">DM Policy</label>
                      <Select
                        value={(channelConfig.config.dmPolicy as string) || "pairing"}
                        onChange={(e) =>
                          updateChannel(preset.type, { dmPolicy: e.target.value })
                        }
                      >
                        <option value="pairing">Pairing</option>
                        <option value="allowlist">Allowlist</option>
                        <option value="open">Open</option>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {templateChannels.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No channels configured for this template.</p>
        </div>
      )}
    </div>
  );
}

function ChannelFields({
  type,
  config,
  onUpdate,
}: {
  type: string;
  config: Record<string, unknown>;
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  const lowerType = type.toLowerCase();

  if (lowerType === "whatsapp") {
    return (
      <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
        <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
        <p className="text-sm text-muted-foreground">
          QR pairing happens after deployment. Once your OpenClaw instance is running,
          you will be prompted to scan a QR code with your WhatsApp device.
        </p>
      </div>
    );
  }

  if (lowerType === "telegram") {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Bot Token</label>
        <Input
          type="password"
          placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          value={(config.botToken as string) || ""}
          onChange={(e) => onUpdate({ botToken: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Get this from @BotFather on Telegram
        </p>
      </div>
    );
  }

  if (lowerType === "discord") {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Bot Token</label>
        <Input
          type="password"
          placeholder="Discord bot token"
          value={(config.botToken as string) || ""}
          onChange={(e) => onUpdate({ botToken: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Get this from the Discord Developer Portal
        </p>
      </div>
    );
  }

  if (lowerType === "slack") {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Bot Token</label>
          <Input
            type="password"
            placeholder="xoxb-..."
            value={(config.botToken as string) || ""}
            onChange={(e) => onUpdate({ botToken: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Bot User OAuth Token from your Slack App settings
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">App Token</label>
          <Input
            type="password"
            placeholder="xapp-..."
            value={(config.appToken as string) || ""}
            onChange={(e) => onUpdate({ appToken: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            App-Level Token with connections:write scope
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
      <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <p className="text-sm text-muted-foreground">
        No additional configuration needed for this channel.
      </p>
    </div>
  );
}
