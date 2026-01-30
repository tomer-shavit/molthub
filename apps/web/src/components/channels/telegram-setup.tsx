"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";

export type TelegramSetupState = "idle" | "validating" | "success" | "error";

interface TelegramBotInfo {
  id: number;
  isBot: boolean;
  firstName: string;
  username: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
  supportsInlineQueries: boolean;
}

interface TelegramSetupProps {
  channelId: string;
  apiBaseUrl?: string;
  initialToken?: string;
  onValidated?: (botInfo: TelegramBotInfo) => void;
  onError?: (error: string) => void;
  className?: string;
}

const stateConfig: Record<TelegramSetupState, { variant: "success" | "destructive" | "secondary" | "default"; label: string }> = {
  idle: { variant: "secondary", label: "Not Validated" },
  validating: { variant: "default", label: "Validating..." },
  success: { variant: "success", label: "Validated" },
  error: { variant: "destructive", label: "Failed" },
};

export function TelegramSetup({
  channelId,
  apiBaseUrl = "/api",
  initialToken = "",
  onValidated,
  onError,
  className,
}: TelegramSetupProps) {
  const [token, setToken] = useState(initialToken);
  const [state, setState] = useState<TelegramSetupState>("idle");
  const [botInfo, setBotInfo] = useState<TelegramBotInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!token.trim()) {
      setError("Bot token is required");
      return;
    }

    setState("validating");
    setError(null);
    setBotInfo(null);

    try {
      const res = await fetch(
        `${apiBaseUrl}/channels/${channelId}/auth/validate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim() }),
        },
      );

      const data = await res.json();

      if (data.state === "paired" && data.platformDetails?.botInfo) {
        const info = data.platformDetails.botInfo as TelegramBotInfo;
        setBotInfo(info);
        setState("success");
        onValidated?.(info);
      } else {
        const errorMsg = data.error || "Validation failed";
        setError(errorMsg);
        setState("error");
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
            <Send className="w-4 h-4" />
            Telegram Bot Setup
          </CardTitle>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Enter your Telegram bot token to validate the connection.</p>
          <p className="text-xs">
            Get a token from{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              @BotFather <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* Token Input */}
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={state === "validating"}
          />
          <Button
            className="w-full"
            onClick={handleValidate}
            disabled={state === "validating" || !token.trim()}
          >
            {state === "validating" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              "Validate Token"
            )}
          </Button>
        </div>

        {/* Success: Bot Info */}
        {state === "success" && botInfo && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-700 font-medium">
              <CheckCircle className="w-4 h-4" />
              Bot Connected
            </div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono">@{botInfo.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{botInfo.firstName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bot ID</span>
                <span className="font-mono text-xs">{botInfo.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Join Groups</span>
                <span>{botInfo.canJoinGroups ? "Yes" : "No"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Read Group Messages</span>
                <span>{botInfo.canReadAllGroupMessages ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {state === "error" && error && (
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
