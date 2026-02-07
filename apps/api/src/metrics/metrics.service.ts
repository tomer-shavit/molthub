import { Injectable, Inject } from "@nestjs/common";
import { PrismaClient, PRISMA_CLIENT } from "@clawster/database";

interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

@Injectable()
export class MetricsService {
  private metrics: Map<string, MetricValue[]> = new Map();

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async collectMetrics(): Promise<string> {
    const lines: string[] = [];

    // Bot instance counts by status
    const botInstancesByStatus = await this.prisma.botInstance.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    lines.push("# HELP clawster_instances_total Total number of bot instances");
    lines.push("# TYPE clawster_instances_total gauge");
    for (const row of botInstancesByStatus) {
      lines.push(`clawster_instances_total{status="${row.status}"} ${row._count.id}`);
    }


    // Template counts
    const templateCount = await this.prisma.template.count();
    lines.push("");
    lines.push("# HELP clawster_templates_total Total number of templates");
    lines.push("# TYPE clawster_templates_total gauge");
    lines.push(`clawster_templates_total ${templateCount}`);

    // Workspace counts
    const workspaceCount = await this.prisma.workspace.count();
    lines.push("");
    lines.push("# HELP clawster_workspaces_total Total number of workspaces");
    lines.push("# TYPE clawster_workspaces_total gauge");
    lines.push(`clawster_workspaces_total ${workspaceCount}`);

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