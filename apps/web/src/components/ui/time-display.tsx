"use client";

interface TimeDisplayProps {
  date: string | Date;
  format?: "relative" | "absolute" | "both";
  className?: string;
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDistance(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function TimeDisplay({ date, format: formatType = "relative", className }: TimeDisplayProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const formatted = formatDate(dateObj);
  
  if (formatType === "relative") {
    return (
      <span className={className} title={formatted}>
        {formatDistance(dateObj)}
      </span>
    );
  }
  
  if (formatType === "absolute") {
    return (
      <span className={className}>
        {formatted}
      </span>
    );
  }
  
  return (
    <span className={className} title={formatted}>
      {formatDistance(dateObj)} ({dateObj.toLocaleDateString()})
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
