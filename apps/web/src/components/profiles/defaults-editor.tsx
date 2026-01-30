"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

interface DefaultsEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

export function DefaultsEditor({ value, onChange }: DefaultsEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const internalChange = useRef(false);

  // Only sync from parent if the change didn't originate from this editor
  const serialized = JSON.stringify(value, null, 2);
  if (!internalChange.current && serialized !== text && !error) {
    setText(serialized);
  }
  internalChange.current = false;

  function handleChange(newText: string) {
    setText(newText);
    internalChange.current = true;
    try {
      const parsed = JSON.parse(newText);
      setError(null);
      onChange(parsed);
    } catch {
      setError("Invalid JSON");
    }
  }

  function handleFormat() {
    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      setText(formatted);
      setError(null);
      onChange(parsed);
    } catch {
      setError("Cannot format: invalid JSON");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Defaults (JSON)</label>
        <Button type="button" variant="outline" size="sm" onClick={handleFormat}>
          Format
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full min-h-[200px] rounded-md border border-input bg-muted p-4 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        spellCheck={false}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
