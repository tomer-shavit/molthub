"use client";

import {
  AreaChartComponent,
  LineChartComponent,
  BarChartComponent,
  NoChartData,
} from "@/components/ui/charts";

interface ClientChartProps {
  height?: number;
  data?: Record<string, unknown>[] | null;
}

export function ClientAreaChart({ height = 200, data }: ClientChartProps) {
  if (!data || data.length === 0) {
    return <NoChartData height={height} />;
  }
  return <AreaChartComponent data={data} height={height} />;
}

export function ClientLineChart({ height = 200, data }: ClientChartProps) {
  if (!data || data.length === 0) {
    return <NoChartData height={height} />;
  }
  return <LineChartComponent data={data} height={height} />;
}

export function ClientBarChart({ height = 200, data }: ClientChartProps) {
  if (!data || data.length === 0) {
    return <NoChartData height={height} />;
  }
  return <BarChartComponent data={data} height={height} />;
}
