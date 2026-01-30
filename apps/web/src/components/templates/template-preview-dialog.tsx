"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { TemplateConfigPreview } from "@/lib/api";

interface TemplatePreviewDialogProps {
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatePreviewDialog({
  templateId,
  open,
  onOpenChange,
}: TemplatePreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TemplateConfigPreview | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .previewTemplateConfig(templateId, {})
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, templateId]);

  if (!open) return null;

  const secretRefEntries = preview?.secretRefs
    ? Object.entries(preview.secretRefs)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-dialog-title"
      onKeyDown={(e) => { if (e.key === "Escape") onOpenChange(false); }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative z-50 w-full max-w-2xl max-h-[80vh] overflow-auto rounded-lg border bg-background p-6 shadow-lg mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 id="preview-dialog-title" className="text-lg font-semibold">Config Preview</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading preview...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {preview && !loading && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Generated Config</h3>
              <pre className="bg-muted rounded p-4 overflow-auto text-sm max-h-96">
                <code>{JSON.stringify(preview.config, null, 2)}</code>
              </pre>
            </div>

            {secretRefEntries.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Secret References</h3>
                <div className="space-y-1">
                  {secretRefEntries.map(([key, ref]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs">{key}</span>
                      <span className="text-muted-foreground text-xs">
                        {ref}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
