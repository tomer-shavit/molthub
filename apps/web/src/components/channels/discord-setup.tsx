"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hash, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";

export type DiscordSetupState = "idle" | "validating" | "success" | "error";

interface DiscordBotInfo {
  id: string;
  username: string;
  discriminator: string;
  bot: boolean;
  avatar?: string;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

interface DiscordSetupProps {
  channelId: string;
  apiBaseUrl?: string;
  initialToken?: string;
  onValidated?: (botInfo: DiscordBotInfo, guilds: DiscordGuild[]) => void;
  onGuildSelected?: (guild: DiscordGuild) => void;
  onError?: (error: string) => void;
  className?: string;
}

const stateConfig: Record<DiscordSetupState, { variant: "success" | "destructive" | "secondary" | "default"; label: string }> = {
  idle: { variant: "secondary", label: "Not Validated" },
  validating: { variant: "default", label: "Validating..." },
  success: { variant: "success", label: "Validated" },
  error: { variant: "destructive", label: "Failed" },
};

export function DiscordSetup({
  channelId,
  apiBaseUrl = "/api",
  initialToken = "",
  onValidated,
  onGuildSelected,
  onError,
  className,
}: DiscordSetupProps) {
  const [token, setToken] = useState(initialToken);
  const [state, setState] = useState<DiscordSetupState>("idle");
  const [botInfo, setBotInfo] = useState<DiscordBotInfo | null>(null);
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!token.trim()) {
      setError("Bot token is required");
      return;
    }

    setState("validating");
    setError(null);
    setBotInfo(null);
    setGuilds([]);

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
        const info = data.platformDetails.botInfo as DiscordBotInfo;
        const guildList = (data.platformDetails.guilds || []) as DiscordGuild[];
        setBotInfo(info);
        setGuilds(guildList);
        setState("success");
        onValidated?.(info, guildList);
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

  const handleGuildSelect = (guild: DiscordGuild) => {
    setSelectedGuildId(guild.id);
    onGuildSelected?.(guild);
  };

  const cfg = stateConfig[state];

  return (
    <Card className={cn("max-w-lg mx-auto", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="w-4 h-4" />
            Discord Bot Setup
          </CardTitle>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Enter your Discord bot token to validate and select a server.</p>
          <p className="text-xs">
            Create a bot at the{" "}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Discord Developer Portal <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* Token Input */}
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="Bot token (3 dot-separated segments)"
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
                <span className="font-mono">
                  {botInfo.username}#{botInfo.discriminator}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bot ID</span>
                <span className="font-mono text-xs">{botInfo.id}</span>
              </div>
            </div>
          </div>
        )}

        {/* Guild Selector */}
        {state === "success" && guilds.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Select a Server</h4>
            <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
              {guilds.map((guild) => (
                <button
                  key={guild.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors",
                    selectedGuildId === guild.id && "bg-blue-50 border-l-2 border-l-blue-500",
                  )}
                  onClick={() => handleGuildSelect(guild)}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                    {guild.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`}
                        alt={guild.name}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      guild.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{guild.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{guild.id}</p>
                  </div>
                  {guild.owner && (
                    <Badge variant="secondary" className="ml-auto shrink-0">
                      Owner
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {state === "success" && guilds.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4">
            Bot is not in any servers yet. Invite it using the OAuth2 URL from the Developer Portal.
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
