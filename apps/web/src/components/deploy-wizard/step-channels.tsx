"use client";

import { ChannelSetupStep, ChannelConfig, TemplateChannelPreset } from "@/components/onboarding/channel-setup-step";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface StepChannelsProps {
  templateChannels: TemplateChannelPreset[];
  channelConfigs: ChannelConfig[];
  onChannelChange: (configs: ChannelConfig[]) => void;
  onSkip: () => void;
}

export function StepChannels({
  templateChannels,
  channelConfigs,
  onChannelChange,
  onSkip,
}: StepChannelsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configure Channels</h2>
          <p className="text-muted-foreground mt-1">
            Connect messaging channels so your agent can communicate. You can always add channels later.
          </p>
        </div>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          Skip for now
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <ChannelSetupStep
        templateChannels={templateChannels}
        channelConfigs={channelConfigs}
        onChannelChange={onChannelChange}
      />
    </div>
  );
}
