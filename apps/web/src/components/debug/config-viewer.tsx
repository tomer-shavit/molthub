"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { DebugRedactedConfig } from "@/lib/api";

interface ConfigViewerProps {
  instanceId: string;
}

export function ConfigViewer({ instanceId }: ConfigViewerProps) {
  const [config, setConfig] = useState<DebugRedactedConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.debugGetConfig(instanceId);
      setConfig(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (config) {
      navigator.clipboard.writeText(JSON.stringify(config.config, null, 2));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Configuration</h3>
        <div className="flex gap-2">
          {config && (
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
            >
              Copy
            </button>
          )}
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Loading..." : config ? "Refresh" : "Load"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {config && (
        <div className="space-y-2">
          <div className="flex gap-4 text-sm text-gray-500">
            <span>
              Source: <span className="font-medium text-gray-700">{config.source}</span>
            </span>
            <span>
              Hash: <span className="font-mono text-gray-700">{config.configHash}</span>
            </span>
          </div>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-md overflow-auto text-xs max-h-[500px]">
            {JSON.stringify(config.config, null, 2).replace(
              /"\*\*\*REDACTED\*\*\*"/g,
              '<span class="text-red-400">"***REDACTED***"</span>'
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
