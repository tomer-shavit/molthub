"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { CostEvent } from "@/lib/api";

interface CostEventsTableProps {
  events: CostEvent[];
}

export function CostEventsTable({ events }: CostEventsTableProps) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Input Tokens</TableHead>
            <TableHead className="text-right">Output Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(event.occurredAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{event.provider}</Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">{event.model}</TableCell>
              <TableCell className="text-right tabular-nums">
                {event.inputTokens.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {event.outputTokens.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-medium">
                ${(event.costCents / 100).toFixed(4)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
