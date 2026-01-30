"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Send,
  Gamepad2,
  Hash,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Shield,
  Lock,
  Box,
  CheckCircle2,
} from "lucide-react";

interface ReviewStepProps {
  templateName: string;
  deploymentTarget: { type: string; region?: string };
  channels: Array<{ type: string; config: Record<string, unknown> }>;
  configPreview?: Record<string, unknown>;
}

const channelIconMap: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-4 h-4" />,
  telegram: <Send className="w-4 h-4" />,
  discord: <Gamepad2 className="w-4 h-4" />,
  slack: <Hash className="w-4 h-4" />,
};

function getChannelIcon(type: string): React.ReactNode {
  return channelIconMap[type.toLowerCase()] || <MessageSquare className="w-4 h-4" />;
}

export function ReviewStep({
  templateName,
  deploymentTarget,
  channels,
  configPreview,
}: ReviewStepProps) {
  const [configExpanded, setConfigExpanded] = useState(false);

  const enabledChannels = channels.filter(
    (ch) => ch.config.enabled !== false
  );

  return (
    <div className="space-y-4">
      {/* Template */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Template</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{templateName}</p>
        </CardContent>
      </Card>

      {/* Deployment Target */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Deployment Target</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <Badge variant="secondary" className="capitalize">
                {deploymentTarget.type}
              </Badge>
            </div>
            {deploymentTarget.region && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Region</span>
                <span className="font-medium font-mono">
                  {deploymentTarget.region}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Channels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Channels ({enabledChannels.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {enabledChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels enabled.</p>
          ) : (
            <div className="space-y-2">
              {enabledChannels.map((ch) => (
                <div
                  key={ch.type}
                  className="flex items-center gap-2 p-2 bg-muted rounded-lg"
                >
                  {getChannelIcon(ch.type)}
                  <span className="text-sm font-medium capitalize">
                    {ch.type}
                  </span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {(ch.config.dmPolicy as string) || "pairing"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config Preview */}
      {configPreview && (
        <Card>
          <CardHeader className="pb-3">
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left"
              onClick={() => setConfigExpanded(!configExpanded)}
            >
              {configExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <CardTitle className="text-base">Config Preview</CardTitle>
            </button>
          </CardHeader>
          {configExpanded && (
            <CardContent>
              <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto max-h-80">
                {JSON.stringify(configPreview, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      {/* Security Notes */}
      <Card className="border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-600" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span>Gateway auth token auto-generated</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Lock className="w-4 h-4 text-green-500 shrink-0" />
              <span>Secrets stored encrypted</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Box className="w-4 h-4 text-green-500 shrink-0" />
              <span>Sandbox enabled</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
