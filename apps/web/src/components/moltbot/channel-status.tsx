"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Hash,
  AtSign,
  Send,
  Phone,
  MessageCircle,
  KeyRound,
} from "lucide-react";

export type AuthState = "paired" | "pending" | "expired" | "error" | "not_started";

export interface ChannelStatusData {
  id: string;
  type: string;
  enabled: boolean;
  authState: AuthState;
  dmPolicy: string;
  groupPolicy: string;
  lastActivity?: string;
}

interface ChannelStatusProps {
  channels: ChannelStatusData[];
  onStartAuth?: (channelId: string) => void;
  className?: string;
}

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <Phone className="w-4 h-4" />,
  telegram: <Send className="w-4 h-4" />,
  discord: <Hash className="w-4 h-4" />,
  slack: <AtSign className="w-4 h-4" />,
  signal: <MessageCircle className="w-4 h-4" />,
  imessage: <MessageSquare className="w-4 h-4" />,
  mattermost: <MessageSquare className="w-4 h-4" />,
  "google-chat": <MessageSquare className="w-4 h-4" />,
  "ms-teams": <MessageSquare className="w-4 h-4" />,
  line: <MessageSquare className="w-4 h-4" />,
  matrix: <MessageSquare className="w-4 h-4" />,
};

const authStateConfig: Record<AuthState, { variant: "success" | "warning" | "destructive" | "secondary" | "outline"; label: string }> = {
  paired: { variant: "success", label: "Paired" },
  pending: { variant: "warning", label: "Pending" },
  expired: { variant: "destructive", label: "Expired" },
  error: { variant: "destructive", label: "Error" },
  not_started: { variant: "secondary", label: "Not Started" },
};

export function ChannelStatusList({ channels, onStartAuth, className }: ChannelStatusProps) {
  if (channels.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardContent className="pt-6 text-center py-12">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No channels configured.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add channels in the Config tab to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {channels.map((channel) => (
        <ChannelCard
          key={channel.id}
          channel={channel}
          onStartAuth={onStartAuth}
        />
      ))}
    </div>
  );
}

function ChannelCard({
  channel,
  onStartAuth,
}: {
  channel: ChannelStatusData;
  onStartAuth?: (channelId: string) => void;
}) {
  const icon = channelIcons[channel.type] || <MessageSquare className="w-4 h-4" />;
  const authConfig = authStateConfig[channel.authState];
  const needsAuth = channel.authState === "not_started" || channel.authState === "expired" || channel.authState === "error";

  return (
    <Card className={cn(!channel.enabled && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            <span className="capitalize">{channel.type.replace("-", " ")}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {!channel.enabled && (
              <Badge variant="secondary">Disabled</Badge>
            )}
            <Badge variant={authConfig.variant}>{authConfig.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">DM Policy</span>
            <span className="font-medium capitalize">{channel.dmPolicy}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Group Policy</span>
            <span className="font-medium capitalize">{channel.groupPolicy}</span>
          </div>
          {channel.lastActivity && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Activity</span>
              <span className="text-xs">{new Date(channel.lastActivity).toLocaleString()}</span>
            </div>
          )}
        </div>

        {needsAuth && onStartAuth && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-4"
            onClick={() => onStartAuth(channel.id)}
          >
            <KeyRound className="w-4 h-4 mr-2" />
            Start Auth
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
