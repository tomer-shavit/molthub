"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { DebugProcessInfo } from "@/lib/api";

interface ProcessListProps {
  instanceId: string;
}

export function ProcessList({ instanceId }: ProcessListProps) {
  const [processes, setProcesses] = useState<DebugProcessInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProcesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.debugGetProcesses(instanceId);
      setProcesses(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Processes</h3>
        <button
          onClick={fetchProcesses}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : processes ? "Refresh" : "Run"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {processes && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">PID</th>
                <th className="text-left px-4 py-2 font-medium">Command</th>
                <th className="text-left px-4 py-2 font-medium">CPU %</th>
                <th className="text-left px-4 py-2 font-medium">Memory (MB)</th>
                <th className="text-left px-4 py-2 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((proc, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono">{proc.pid}</td>
                  <td className="px-4 py-2 font-mono text-xs">{proc.command}</td>
                  <td className="px-4 py-2">{proc.cpuPercent.toFixed(1)}</td>
                  <td className="px-4 py-2">{proc.memoryMb.toFixed(1)}</td>
                  <td className="px-4 py-2">{proc.uptime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
