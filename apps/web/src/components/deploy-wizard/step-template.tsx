"use client";

import { TemplatePicker, TemplateOption } from "@/components/onboarding/template-picker";
import { Input } from "@/components/ui/input";

interface StepTemplateProps {
  templates: TemplateOption[];
  selectedTemplateId: string | null;
  onTemplateSelect: (id: string) => void;
  botName: string;
  onBotNameChange: (name: string) => void;
}

export function StepTemplate({
  templates,
  selectedTemplateId,
  onTemplateSelect,
  botName,
  onBotNameChange,
}: StepTemplateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Choose a role for your agent</h2>
        <p className="text-muted-foreground mt-1">
          Each template defines the agent's personality, suggested channels, and tool profile.
        </p>
      </div>

      <div className="space-y-1.5 max-w-sm">
        <label className="text-sm font-medium">Name your bot</label>
        <Input
          type="text"
          placeholder="e.g., support-bot, devops-agent"
          value={botName}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "" || /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(val)) {
              onBotNameChange(val);
            }
          }}
          maxLength={63}
        />
        {botName.length > 0 && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(botName) && (
          <p className="text-xs text-red-600">
            Must start with a letter or number, and contain only letters, numbers, hyphens, or underscores.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          A unique name for this OpenClaw agent
        </p>
      </div>

      <TemplatePicker
        templates={templates}
        selected={selectedTemplateId}
        onSelect={onTemplateSelect}
      />
    </div>
  );
}
