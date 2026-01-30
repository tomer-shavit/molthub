"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AtSign, CheckCircle, XCircle, Loader2, ExternalLink, Zap } from "lucide-react";

export type SlackSetupState = "idle" | "validating" | "success" | "error";

interface SlackBotInfo {
  botId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  url: string;
}

interface SlackSetupProps {
  channelId: string;
  apiBaseUrl?: string;
  initialBotToken?: string;
  initialAppToken?: string;
  onValidated?: (botInfo: SlackBotInfo, socketModeValid: boolean) => void;
  onError?: (error: string) => void;
  className?: string;
}

const stateConfig: Record<SlackSetupState, { variant: "success" | "destructive" | "secondary" | "default"; label: string }> = {
  idle: { variant: "secondary", label: "Not Validated" },
  validating: { variant: "default", label: "Validating..." },
  success: { variant: "success", label: "Validated" },
  error: { variant: "destructive", label: "Failed" },
};

export function SlackSetup({
  channelId,
  apiBaseUrl = "/api",
  initialBotToken = "",
  initialAppToken = "",
  onValidated,
  onError,
  className,
}: SlackSetupProps) {
  const [botToken, setBotToken] = useState(initialBotToken);
  const [appToken, setAppToken] = useState(initialAppToken);
  const [state, setState] = useState<SlackSetupState>("idle");
  const [botInfo, setBotInfo] = useState<SlackBotInfo | null>(null);
  const [socketModeValid, setSocketModeValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!botToken.trim()) {
      setError("Bot token (xoxb-) is required");
      return;
    }
    if (!appToken.trim()) {
      setError("App-level token (xapp-) is required for Socket Mode");
      return;
    }

    setState("validating");
    setError(null);
    setBotInfo(null);
    setSocketModeValid(null);

    try {
      const res = await fetch(
        `${apiBaseUrl}/channels/${channelId}/auth/validate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: botToken.trim(),
            appToken: appToken.trim(),
          }),
        },
      );

      const data = await res.json();

      if (data.state === "paired" && data.platformDetails?.botInfo) {
        const info = data.platformDetails.botInfo as SlackBotInfo;
        const smValid = data.platformDetails.socketModeValid === true;
        setBotInfo(info);
        setSocketModeValid(smValid);
        setState("success");
        onValidated?.(info, smValid);
      } else {
        const errorMsg = data.error || "Validation failed";
        setError(errorMsg);
        setState("error");

        // Partial success: bot token valid but Socket Mode failed
        if (data.platformDetails?.botInfo) {
          setBotInfo(data.platformDetails.botInfo as SlackBotInfo);
          setSocketModeValid(false);
        }

        onError?.(errorMsg);
      }
    } catch {
      const errorMsg = "Network error during validation";
      setError(errorMsg);
      setState("error");
      onError?.(errorMsg);
    }
  };

  const cfg = stateConfig[state];

  return (
    <Card className={cn("max-w-md mx-auto", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AtSign className="w-4 h-4" />
            Slack Socket Mode Setup
          </CardTitle>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            Slack requires both a <strong>bot token</strong> and an{" "}
            <strong>app-level token</strong> for Socket Mode.
          </p>
          <p className="text-xs">
            Configure your app at{" "}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Slack API <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* Bot Token Input */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Bot Token (xoxb-)</label>
          <Input
            type="password"
            placeholder="xoxb-..."
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            disabled={state === "validating"}
          />
        </div>

        {/* App Token Input */}
        <div className="space-y-1">
          <label className="text-sm font-medium">App-Level Token (xapp-)</label>
          <Input
            type="password"
            placeholder="xapp-..."
            value={appToken}
            onChange={(e) => setAppToken(e.target.value)}
            disabled={state === "validating"}
          />
          <p className="text-xs text-muted-foreground">
            Enable Socket Mode in your app settings and generate an app-level token with
            the <code>connections:write</code> scope.
          </p>
        </div>

        {/* Validate Button */}
        <Button
          className="w-full"
          onClick={handleValidate}
          disabled={state === "validating" || !botToken.trim() || !appToken.trim()}
        >
          {state === "validating" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Validating...
            </>
          ) : (
            "Validate Tokens"
          )}
        </Button>

        {/* Success: Bot Info + Socket Mode Status */}
        {botInfo && (
          <div
            className={cn(
              "border rounded-lg p-4 space-y-3",
              state === "success"
                ? "bg-green-50 border-green-200"
                : "bg-yellow-50 border-yellow-200",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 font-medium",
                state === "success" ? "text-green-700" : "text-yellow-700",
              )}
            >
              <CheckCircle className="w-4 h-4" />
              Bot Token Valid
            </div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Workspace</span>
                <span>{botInfo.teamName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Team ID</span>
                <span className="font-mono text-xs">{botInfo.teamId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bot User ID</span>
                <span className="font-mono text-xs">{botInfo.botUserId}</span>
              </div>
            </div>

            {/* Socket Mode status */}
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2">
                <Zap className={cn("w-4 h-4", socketModeValid ? "text-green-600" : "text-red-500")} />
                <span className="text-sm font-medium">
                  Socket Mode:{" "}
                  {socketModeValid ? (
                    <span className="text-green-700">Connected</span>
                  ) : (
                    <span className="text-red-700">Failed</span>
                  )}
                </span>
              </div>
              {socketModeValid === false && (
                <p className="text-xs text-red-600 mt-1">
                  Socket Mode connection failed. Ensure Socket Mode is enabled in your
                  Slack app settings and the app-level token has the correct scope.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error (only show if no botInfo partial success) */}
        {state === "error" && error && !botInfo && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
