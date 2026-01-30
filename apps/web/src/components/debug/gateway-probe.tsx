"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { DebugGatewayProbeResult } from "@/lib/api";

interface GatewayProbeProps {
  instanceId: string;
}

export function GatewayProbe({ instanceId }: GatewayProbeProps) {
  const [probe, setProbe] = useState<DebugGatewayProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runProbe = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.debugProbeGateway(instanceId);
      setProbe(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Gateway Probe</h3>
        <button
          onClick={runProbe}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Probing..." : probe ? "Re-probe" : "Probe"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {probe && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-3 border rounded-md">
            <div className="text-xs text-gray-500 uppercase">Reachable</div>
            <div className={`text-lg font-semibold ${probe.reachable ? "text-green-600" : "text-red-600"}`}>
              {probe.reachable ? "Yes" : "No"}
            </div>
          </div>
          <div className="p-3 border rounded-md">
            <div className="text-xs text-gray-500 uppercase">Latency</div>
            <div className="text-lg font-semibold">
              {probe.latencyMs >= 0 ? `${probe.latencyMs}ms` : "N/A"}
            </div>
          </div>
          <div className="p-3 border rounded-md">
            <div className="text-xs text-gray-500 uppercase">Protocol</div>
            <div className="text-lg font-semibold">v{probe.protocolVersion}</div>
          </div>
          <div className="p-3 border rounded-md">
            <div className="text-xs text-gray-500 uppercase">Health</div>
            <div className={`text-lg font-semibold ${probe.healthOk ? "text-green-600" : "text-red-600"}`}>
              {probe.healthOk ? "OK" : "Degraded"}
            </div>
          </div>
          <div className="p-3 border rounded-md">
            <div className="text-xs text-gray-500 uppercase">Channels</div>
            <div className="text-lg font-semibold">{probe.channelsLinked}</div>
          </div>
          <div className="p-3 border rounded-md">
            <div className="text-xs text-gray-500 uppercase">Uptime</div>
            <div className="text-lg font-semibold">
              {probe.uptime > 0
                ? `${Math.floor(probe.uptime / 3600)}h ${Math.floor((probe.uptime % 3600) / 60)}m`
                : "N/A"}
            </div>
          </div>
          {probe.error && (
            <div className="col-span-full p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {probe.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
