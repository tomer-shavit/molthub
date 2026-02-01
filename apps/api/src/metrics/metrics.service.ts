import { Injectable } from "@nestjs/common";
import { prisma } from "@molthub/database";

interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

@Injectable()
export class MetricsService {
  private metrics: Map<string, MetricValue[]> = new Map();

  async collectMetrics(): Promise<string> {
    const lines: string[] = [];

    // Bot instance counts by status
    const botInstancesByStatus = await prisma.botInstance.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    lines.push("# HELP molthub_instances_total Total number of bot instances");
    lines.push("# TYPE molthub_instances_total gauge");
    for (const row of botInstancesByStatus) {
      lines.push(`molthub_instances_total{status="${row.status}"} ${row._count.id}`);
    }

    // Audit events in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const auditEvents = await prisma.auditEvent.count({
      where: { timestamp: { gte: oneHourAgo } },
    });

    lines.push("");
    lines.push("# HELP molthub_audit_events_total Audit events in last hour");
    lines.push("# TYPE molthub_audit_events_total counter");
    lines.push(`molthub_audit_events_total ${auditEvents}`);

    // Template counts
    const templateCount = await prisma.template.count();
    lines.push("");
    lines.push("# HELP molthub_templates_total Total number of templates");
    lines.push("# TYPE molthub_templates_total gauge");
    lines.push(`molthub_templates_total ${templateCount}`);

    // Workspace counts
    const workspaceCount = await prisma.workspace.count();
    lines.push("");
    lines.push("# HELP molthub_workspaces_total Total number of workspaces");
    lines.push("# TYPE molthub_workspaces_total gauge");
    lines.push(`molthub_workspaces_total ${workspaceCount}`);

    return lines.join("\n");
  }

  formatPrometheus(metrics: MetricValue[]): string {
    const lines: string[] = [];
    const grouped = this.groupBy(metrics, "name");

    for (const [name, values] of grouped) {
      lines.push(`# HELP ${name} Metric`);
      lines.push(`# TYPE ${name} gauge`);
      
      for (const v of values) {
        const labels = v.labels 
          ? "{" + Object.entries(v.labels).map(([k, v]) => `${k}="${v}"`).join(",") + "}"
          : "";
        lines.push(`${name}${labels} ${v.value}`);
      }
    }

    return lines.join("\n");
  }

  private groupBy<T>(array: T[], key: keyof T): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of array) {
      const k = String(item[key]);
      const existing = map.get(k) || [];
      existing.push(item);
      map.set(k, existing);
    }
    return map;
  }
}