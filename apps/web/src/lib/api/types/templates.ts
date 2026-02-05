/**
 * Template types.
 */

export interface TemplateRequiredInput {
  key: string;
  label: string;
  envVar: string;
  configPath: string;
  secret: boolean;
  placeholder?: string;
}

export interface TemplateChannelPreset {
  type: string;
  enabled: boolean;
  defaults: Record<string, unknown>;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultConfig: Record<string, unknown>;
  manifestTemplate: Record<string, unknown>;
  isBuiltin: boolean;
  requiredInputs?: TemplateRequiredInput[];
  channels?: TemplateChannelPreset[];
  recommendedPolicies?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplatePayload {
  name: string;
  description: string;
  category: string;
  defaultConfig: Record<string, unknown>;
  channels?: Array<{ type: string; enabled: boolean; defaults: Record<string, unknown> }>;
  recommendedPolicies?: string[];
  manifestTemplate?: Record<string, unknown>;
}

export interface TemplateConfigPreview {
  config: Record<string, unknown>;
  secretRefs: Record<string, string>;
}

export interface PreviewTemplateConfigPayload {
  values?: Record<string, string>;
  configOverrides?: Record<string, unknown>;
}
