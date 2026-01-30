"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Rocket, Bot, MessageSquare, Server, Layers } from "lucide-react";
import { TemplateOption } from "@/components/onboarding/template-picker";
import { ChannelConfig } from "@/components/onboarding/channel-setup-step";
import { Fleet } from "@/lib/api";

interface StepReviewProps {
  botName: string;
  template: TemplateOption | undefined;
  channels: ChannelConfig[];
  fleets: Fleet[];
  selectedFleetId: string;
  onFleetChange: (fleetId: string) => void;
  deploying: boolean;
  onDeploy: () => void;
}

export function StepReview({
  botName,
  template,
  channels,
  fleets,
  selectedFleetId,
  onFleetChange,
  deploying,
  onDeploy,
}: StepReviewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Review &amp; Deploy</h2>
        <p className="text-muted-foreground mt-1">
          Everything looks good? Hit deploy to start your agent.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{botName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Template</span>
              <span className="font-medium">{template?.name || "—"}</span>
            </div>
            {template?.category && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium capitalize">{template.category}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length > 0 ? (
              <div className="space-y-1">
                {channels.map((ch, i) => (
                  <div key={i} className="text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="capitalize">{ch.type}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No channels configured. You can add them later.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" />
              Deployment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Target</span>
              <span className="font-medium">Docker</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Auth</span>
              <span className="font-medium">Auto-generated token</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Isolation</span>
              <span className="font-medium">Profile-based</span>
            </div>
          </CardContent>
        </Card>

        {fleets.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Fleet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedFleetId}
                onChange={(e) => onFleetChange(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {fleet.name} ({fleet.environment})
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button
          size="lg"
          onClick={onDeploy}
          disabled={deploying}
          className="px-8"
        >
          {deploying ? (
            <>
              <span className="animate-spin mr-2">
                <Rocket className="w-4 h-4" />
              </span>
              Deploying...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 mr-2" />
              Deploy Agent
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
