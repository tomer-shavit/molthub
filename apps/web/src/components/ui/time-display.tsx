"use client";

import { format, formatDistanceToNow } from "date-fns";

interface TimeDisplayProps {
  date: string | Date;
  format?: "relative" | "absolute" | "both";
  className?: string;
}

export function TimeDisplay({ date, format: formatType = "relative", className }: TimeDisplayProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  if (formatType === "relative") {
    return (
      <span className={className} title={format(dateObj, "PPpp")}>
        {formatDistanceToNow(dateObj, { addSuffix: true })}
      </span>
    );
  }
  
  if (formatType === "absolute") {
    return (
      <span className={className}>
        {format(dateObj, "PPpp")}
      </span>
    );
  }
  
  return (
    <span className={className} title={format(dateObj, "PPpp")}>
      {formatDistanceToNow(dateObj, { addSuffix: true })} ({format(dateObj, "PP")})
    </span>
  );
}

export function DurationDisplay({ ms }: { ms: number }) {
  if (ms < 1000) {
    return <span>{ms}ms</span>;
  }
  if (ms < 60000) {
    return <span>{(ms / 1000).toFixed(1)}s</span>;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return <span>{minutes}m {seconds}s</span>;
}
