"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ChannelStatus = "active" | "inactive" | "error" | "not_configured";

export interface ChannelCellData {
  status: ChannelStatus;
  details?: string;
  channelId?: string;
}

export interface BotChannelRow {
  botId: string;
  botName: string;
  channels: Record<string, ChannelCellData>;
}

interface ChannelMatrixProps {
  bots: BotChannelRow[];
  channelTypes: string[];
  onCellClick?: (botId: string, channelType: string, channelId?: string) => void;
}

function StatusDot({ status }: { status: ChannelStatus }) {
  const colorClass = {
    active: "bg-green-500",
    inactive: "bg-gray-400",
    error: "bg-red-500",
    not_configured: "bg-gray-200",
  }[status];

  return (
    <span
      className={cn("inline-block w-3 h-3 rounded-full", colorClass)}
      title={status}
    />
  );
}

export function ChannelMatrix({ bots, channelTypes, onCellClick }: ChannelMatrixProps) {
  const [hoveredCell, setHoveredCell] = useState<{ botId: string; channel: string } | null>(null);

  // Compute summary stats
  const summary = channelTypes.reduce(
    (acc, type) => {
      let active = 0;
      let error = 0;
      let total = 0;
      for (const bot of bots) {
        const cell = bot.channels[type];
        if (cell && cell.status !== "not_configured") {
          total++;
          if (cell.status === "active") active++;
          if (cell.status === "error") error++;
        }
      }
      acc[type] = { active, error, total };
      return acc;
    },
    {} as Record<string, { active: number; error: number; total: number }>
  );

  const totalChannels = Object.values(summary).reduce((sum, s) => sum + s.total, 0);
  const totalActive = Object.values(summary).reduce((sum, s) => sum + s.active, 0);
  const totalDegraded = Object.values(summary).reduce((sum, s) => sum + s.error, 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <Badge variant="secondary">
          {totalChannels} total channels
        </Badge>
        <Badge variant="success">
          {totalActive} active
        </Badge>
        {totalDegraded > 0 && (
          <Badge variant="destructive">
            {totalDegraded} error
          </Badge>
        )}
      </div>

      {/* Matrix table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Bot</TableHead>
              {channelTypes.map((type) => (
                <TableHead key={type} className="text-center capitalize">
                  {type}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bots.map((bot) => (
              <TableRow key={bot.botId}>
                <TableCell className="font-medium">{bot.botName}</TableCell>
                {channelTypes.map((type) => {
                  const cell = bot.channels[type] || { status: "not_configured" as const };
                  const isHovered =
                    hoveredCell?.botId === bot.botId &&
                    hoveredCell?.channel === type;
                  return (
                    <TableCell
                      key={type}
                      className={cn(
                        "text-center cursor-pointer transition-colors",
                        isHovered && "bg-muted",
                        cell.status !== "not_configured" && "hover:bg-muted/80"
                      )}
                      onMouseEnter={() =>
                        setHoveredCell({ botId: bot.botId, channel: type })
                      }
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() => {
                        if (cell.status !== "not_configured") {
                          onCellClick?.(bot.botId, type, cell.channelId);
                        }
                      }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <StatusDot status={cell.status} />
                        {isHovered && cell.details && (
                          <span className="text-xs text-muted-foreground max-w-[100px] truncate">
                            {cell.details}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {bots.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={channelTypes.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  No bots found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
