"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Terminal, ArrowDown, Search, X, Radio } from "lucide-react";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { useLogStream } from "@/hooks/use-log-stream";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;
}

interface LogViewerProps {
  logs: LogEntry[];
  isLive?: boolean;
  instanceId?: string;
  className?: string;
}

const levelColors: Record<LogLevel, string> = {
  debug: "text-gray-400",
  info: "text-blue-500",
  warn: "text-yellow-500",
  error: "text-red-500",
};

const levelBgColors: Record<LogLevel, string> = {
  debug: "bg-gray-100 text-gray-700",
  info: "bg-blue-100 text-blue-700",
  warn: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
};

export function LogViewer({ logs: staticLogs, isLive: defaultLive = false, instanceId, className }: LogViewerProps) {
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(
    new Set(["debug", "info", "warn", "error"])
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [liveMode, setLiveMode] = useState(defaultLive && !!instanceId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // WebSocket log streaming
  const { logs: streamLogs, isStreaming, status: wsStatus, clearLogs } = useLogStream(
    liveMode && instanceId ? instanceId : ""
  );
  const activeLogs = liveMode && instanceId ? streamLogs : staticLogs;

  const toggleLevel = useCallback((level: LogLevel) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const filteredLogs = activeLogs.filter((log) => {
    if (!levelFilter.has(log.level)) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Logs
            {liveMode && isStreaming && (
              <ConnectionStatus status={wsStatus} />
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {instanceId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLiveMode(!liveMode)}
                className={cn(liveMode && "bg-accent")}
              >
                <Radio className="w-4 h-4 mr-1" />
                {liveMode ? "Live" : "Static"}
              </Button>
            )}
            {liveMode && instanceId && (
              <Button variant="outline" size="sm" onClick={clearLogs}>
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn(autoScroll && "bg-accent")}
            >
              <ArrowDown className="w-4 h-4 mr-1" />
              Auto-scroll
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(["debug", "info", "warn", "error"] as LogLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-colors",
                  levelFilter.has(level)
                    ? levelBgColors[level]
                    : "bg-muted text-muted-foreground"
                )}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="bg-gray-950 text-gray-100 rounded-lg p-4 font-mono text-xs overflow-auto max-h-[500px] min-h-[300px]"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[200px] text-gray-500">
              {liveMode ? "Waiting for logs..." : "No logs to display"}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex gap-2 py-0.5 hover:bg-gray-900 px-1 rounded">
                <span className="text-gray-500 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn("font-bold flex-shrink-0 w-12 uppercase", levelColors[log.level])}>
                  {log.level}
                </span>
                {log.source && (
                  <span className="text-purple-400 flex-shrink-0">[{log.source}]</span>
                )}
                <span className="text-gray-200 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {filteredLogs.length} of {activeLogs.length} entries
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
