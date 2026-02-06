"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProvisioningLogEntry } from "@/hooks/use-provisioning-events";

interface DeployTerminalProps {
  logs: ProvisioningLogEntry[];
  defaultExpanded?: boolean;
  autoExpandOnError?: boolean;
  status?: "in_progress" | "completed" | "error" | "timeout";
}

const STEP_COLORS: Record<string, string> = {
  validate_config: "text-blue-400",
  security_audit: "text-purple-400",
  build_image: "text-cyan-400",
  pull_image: "text-cyan-400",
  create_container: "text-green-400",
  write_config: "text-yellow-400",
  start_container: "text-green-400",
  install_openclaw: "text-cyan-400",
  install_service: "text-green-400",
  start_service: "text-green-400",
  wait_for_gateway: "text-orange-400",
  health_check: "text-emerald-400",
  generate_manifests: "text-cyan-400",
  apply_configmap: "text-green-400",
  apply_deployment: "text-green-400",
  apply_service: "text-green-400",
  wait_for_pod: "text-orange-400",
  create_task_definition: "text-cyan-400",
  create_service: "text-green-400",
  wait_for_task: "text-orange-400",
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function DeployTerminal({
  logs,
  defaultExpanded = true,
  autoExpandOnError = true,
  status,
}: DeployTerminalProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Auto-expand on error
  useEffect(() => {
    if (autoExpandOnError && status === "error") {
      setExpanded(true);
    }
  }, [status, autoExpandOnError]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (expanded && shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, expanded]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const handleCopy = async () => {
    const text = logs.map((l) => `[${formatTimestamp(l.timestamp)}] [${l.stepId}] ${l.line}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  if (logs.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-gray-400 hover:bg-gray-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Terminal className="h-3.5 w-3.5" />
          <span className="font-medium">Deploy Logs</span>
          <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
            {logs.length} lines
          </span>
        </div>
        {expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
          >
            {copied ? (
              <Check className="h-3 w-3 mr-1" />
            ) : (
              <Copy className="h-3 w-3 mr-1" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </button>

      {/* Terminal body */}
      {expanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[28rem] overflow-y-auto px-3 pb-3 font-mono text-xs leading-5 scroll-smooth terminal-scrollbar"
        >
          {logs.map((entry, i) => (
            <div key={i} className="flex gap-2 hover:bg-gray-900/50">
              <span className="text-gray-600 shrink-0 select-none">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span
                className={`shrink-0 select-none ${STEP_COLORS[entry.stepId] || "text-gray-500"}`}
              >
                {entry.stepId}
              </span>
              <span
                className={
                  entry.stream === "stderr"
                    ? "text-amber-400/90"
                    : "text-gray-300"
                }
              >
                {entry.line}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
