"use client";

import { useState } from "react";
import { ProcessList } from "@/components/debug/process-list";
import { GatewayProbe } from "@/components/debug/gateway-probe";
import { ConfigViewer } from "@/components/debug/config-viewer";
import { ConnectivityTest } from "@/components/debug/connectivity-test";
import { api } from "@/lib/api";
import type { DebugEnvVarStatus, DebugFileInfo } from "@/lib/api";

interface DebugClientProps {
  instanceId: string;
  instanceName: string;
}

type DebugTab = "processes" | "gateway" | "config" | "env" | "state" | "connectivity";

const tabs: { key: DebugTab; label: string }[] = [
  { key: "processes", label: "Processes" },
  { key: "gateway", label: "Gateway Probe" },
  { key: "config", label: "Config" },
  { key: "env", label: "Environment" },
  { key: "state", label: "State Files" },
  { key: "connectivity", label: "Connectivity" },
];

export function DebugClient({ instanceId, instanceName }: DebugClientProps) {
  const [activeTab, setActiveTab] = useState<DebugTab>("processes");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Debug: {instanceName}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Introspection and diagnostics for instance {instanceId}
        </p>
      </div>

      <div className="border-b">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-4">
        {activeTab === "processes" && <ProcessList instanceId={instanceId} />}
        {activeTab === "gateway" && <GatewayProbe instanceId={instanceId} />}
        {activeTab === "config" && <ConfigViewer instanceId={instanceId} />}
        {activeTab === "env" && <EnvStatusPanel instanceId={instanceId} />}
        {activeTab === "state" && <StateFilesPanel instanceId={instanceId} />}
        {activeTab === "connectivity" && <ConnectivityTest instanceId={instanceId} />}
      </div>
    </div>
  );
}

// ---------- Inline panels for env and state-files ----------

function EnvStatusPanel({ instanceId }: { instanceId: string }) {
  const [envVars, setEnvVars] = useState<DebugEnvVarStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.debugGetEnvStatus(instanceId);
      setEnvVars(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "required": return "bg-purple-100 text-purple-700";
      case "optional": return "bg-gray-100 text-gray-600";
      case "channel": return "bg-blue-100 text-blue-700";
      case "ai": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Environment Variables</h3>
        <button
          onClick={fetch_}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : envVars ? "Refresh" : "Check"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {envVars && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Variable</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {envVars.map((v) => (
                <tr key={v.name} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{v.name}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${v.isSet ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="ml-2 text-xs">{v.isSet ? "Set" : "Not set"}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor(v.category)}`}>
                      {v.category}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StateFilesPanel({ instanceId }: { instanceId: string }) {
  const [files, setFiles] = useState<DebugFileInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.debugGetStateFiles(instanceId);
      setFiles(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">State Files</h3>
        <button
          onClick={fetch_}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : files ? "Refresh" : "Load"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {files && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-md">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${f.isDirectory ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                {f.isDirectory ? "DIR" : "FILE"}
              </span>
              <span className="font-mono text-sm">{f.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
