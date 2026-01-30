"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Send,
  Gamepad2,
  Hash,
  MessageSquare,
} from "lucide-react";

export interface TemplateChannel {
  type: string;
  enabled: boolean;
  defaults: Record<string, unknown>;
}

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  category: string;
  channels: TemplateChannel[];
}

interface TemplatePickerProps {
  templates: TemplateOption[];
  selected: string | null;
  onSelect: (id: string) => void;
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

export function TemplatePicker({ templates, selected, onSelect }: TemplatePickerProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {templates.map((template) => {
        const isSelected = selected === template.id;

        return (
          <Card
            key={template.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              isSelected && "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => onSelect(template.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{template.name}</CardTitle>
                <Badge variant="secondary" className="ml-2 shrink-0">
                  {template.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {template.description}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">Channels:</span>
                {template.channels
                  .filter((ch) => ch.enabled)
                  .map((ch) => (
                    <span
                      key={ch.type}
                      className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full"
                    >
                      {getChannelIcon(ch.type)}
                      <span className="capitalize">{ch.type}</span>
                    </span>
                  ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
