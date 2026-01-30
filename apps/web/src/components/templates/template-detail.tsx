"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemplatePreviewDialog } from "./template-preview-dialog";
import { categoryColors, getChannelIcon } from "./template-constants";
import type { Template } from "@/lib/api";

interface TemplateDetailProps {
  template: Template;
}

export function TemplateDetail({ template }: TemplateDetailProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const categoryColor =
    categoryColors[template.category.toLowerCase()] ?? categoryColors.minimal;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{template.name}</CardTitle>
                <p className="text-muted-foreground">{template.description}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline" className={categoryColor}>
                    {template.category}
                  </Badge>
                  {template.isBuiltin && (
                    <Badge variant="secondary">Builtin</Badge>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <Link href={`/bots/new?templateId=${template.id}`}>
                  <Button>Use Template</Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview Config
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Builtin / Custom info */}
        {template.isBuiltin ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Builtin Template</p>
                <p className="text-sm text-muted-foreground">
                  This template is maintained by the platform and cannot be
                  modified.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center gap-2 pt-6">
              <Button variant="outline" size="sm" disabled>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
              <span className="text-xs text-muted-foreground ml-2">
                Edit and delete coming soon
              </span>
            </CardContent>
          </Card>
        )}

        {/* Channels */}
        {template.channels && template.channels.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Channels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {template.channels.map((ch) => {
                  const Icon = getChannelIcon(ch.type);
                  return (
                    <div
                      key={ch.type}
                      className="flex items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{ch.type}</span>
                      <Badge
                        variant={ch.enabled ? "success" : "secondary"}
                        className="text-xs"
                      >
                        {ch.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Required Inputs */}
        {template.requiredInputs && template.requiredInputs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Required Inputs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {template.requiredInputs.map((input) => (
                  <div
                    key={input.key}
                    className="flex items-start justify-between rounded-md border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{input.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Config path: {input.configPath}
                      </p>
                      {input.placeholder && (
                        <p className="text-xs text-muted-foreground">
                          Example: {input.placeholder}
                        </p>
                      )}
                    </div>
                    {input.secret && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        Secret
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Default Config */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Default Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted rounded p-4 overflow-auto text-sm">
              <code>{JSON.stringify(template.defaultConfig, null, 2)}</code>
            </pre>
          </CardContent>
        </Card>
      </div>

      <TemplatePreviewDialog
        templateId={template.id}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
