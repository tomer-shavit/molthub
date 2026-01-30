"use client";

import { type TemplateChannelPreset } from "./channel-setup-step";

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  category?: string;
  channels?: TemplateChannelPreset[];
  requiredInputs?: Array<{ key: string; label: string; type?: string }>;
}

interface TemplatePickerProps {
  templates: TemplateOption[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function TemplatePicker({ templates, selected, onSelect }: TemplatePickerProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {templates.map((template) => (
        <button
          key={template.id}
          onClick={() => onSelect(template.id)}
          className={`p-4 rounded-lg border text-left transition-colors ${
            selected === template.id
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          <h3 className="font-medium">{template.name}</h3>
          <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
          {template.channels && template.channels.length > 0 && (
            <div className="flex gap-1 mt-2">
              {template.channels.map((ch) => (
                <span key={ch.type} className="text-xs bg-muted px-2 py-0.5 rounded">
                  {ch.type}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
