"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileCode, Save, Eye, EyeOff, AlertCircle, Check } from "lucide-react";

interface ConfigEditorProps {
  currentConfig: string;
  desiredConfig?: string;
  onApply?: (config: string) => void;
  validationErrors?: string[];
  isApplying?: boolean;
  className?: string;
}

export function ConfigEditor({
  currentConfig,
  desiredConfig,
  onApply,
  validationErrors = [],
  isApplying = false,
  className,
}: ConfigEditorProps) {
  const [value, setValue] = useState(desiredConfig || currentConfig);
  const [showDiff, setShowDiff] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Basic JSON validation
    try {
      JSON.parse(newValue);
      setLocalErrors([]);
    } catch (err) {
      setLocalErrors([(err as Error).message]);
    }
  }, []);

  const handleApply = useCallback(() => {
    if (localErrors.length > 0) return;
    try {
      JSON.parse(value);
      onApply?.(value);
    } catch {
      setLocalErrors(["Invalid JSON"]);
    }
  }, [value, localErrors, onApply]);

  const hasChanges = value !== currentConfig;
  const allErrors = [...localErrors, ...validationErrors];

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCode className="w-4 h-4" />
            Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="warning">Unsaved Changes</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDiff(!showDiff)}
            >
              {showDiff ? (
                <><EyeOff className="w-4 h-4 mr-1" /> Hide Diff</>
              ) : (
                <><Eye className="w-4 h-4 mr-1" /> Show Diff</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!hasChanges || allErrors.length > 0 || isApplying}
            >
              {isApplying ? (
                "Applying..."
              ) : (
                <><Save className="w-4 h-4 mr-1" /> Apply</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showDiff ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Current</p>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-[500px] font-mono">
                {formatJson(currentConfig)}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Desired</p>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-[500px] font-mono">
                {formatJson(value)}
              </pre>
            </div>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={handleChange}
            className={cn(
              "w-full min-h-[400px] p-4 rounded-lg border bg-muted font-mono text-xs",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "resize-y",
              allErrors.length > 0 && "border-red-500 focus:ring-red-500"
            )}
            spellCheck={false}
          />
        )}

        {allErrors.length > 0 && (
          <div className="mt-3 space-y-1">
            {allErrors.map((error, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ))}
          </div>
        )}

        {hasChanges && allErrors.length === 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
            <Check className="w-4 h-4" />
            <span>Valid JSON - ready to apply</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatJson(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}
