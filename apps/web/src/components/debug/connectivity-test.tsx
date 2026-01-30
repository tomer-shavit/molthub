"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { DebugConnectivityResult } from "@/lib/api";

interface ConnectivityTestProps {
  instanceId: string;
}

export function ConnectivityTest({ instanceId }: ConnectivityTestProps) {
  const [result, setResult] = useState<DebugConnectivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.debugTestConnectivity(instanceId);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const statusDot = (ok: boolean) => (
    <span className={`inline-block w-3 h-3 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Connectivity</h3>
        <button
          onClick={runTest}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Testing..." : result ? "Re-test" : "Test"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 border rounded-md">
            {statusDot(result.gatewayPort.reachable)}
            <div>
              <div className="font-medium">Gateway Port</div>
              <div className="text-sm text-gray-500">
                {result.gatewayPort.reachable
                  ? `Reachable (${result.gatewayPort.latencyMs}ms)`
                  : "Unreachable"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-md">
            {statusDot(result.dns.resolved)}
            <div>
              <div className="font-medium">DNS Resolution</div>
              <div className="text-sm text-gray-500">
                {result.dns.resolved
                  ? `Resolved${result.dns.ip ? ` (${result.dns.ip})` : ""}`
                  : "Failed to resolve"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-md">
            {statusDot(result.internet.reachable)}
            <div>
              <div className="font-medium">Internet</div>
              <div className="text-sm text-gray-500">
                {result.internet.reachable ? "Reachable" : "Unreachable"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
