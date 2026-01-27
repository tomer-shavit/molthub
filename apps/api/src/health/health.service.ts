import { Injectable } from "@nestjs/common";
import { prisma } from "@molthub/database";

interface HealthCheckResult {
  status: "ok" | "error" | "degraded";
  checks: {
    database: { status: "ok" | "error"; responseTime: number };
    aws?: { status: "ok" | "error"; message?: string };
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  async check(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult["checks"] = {
      database: { status: "error", responseTime: 0 },
    };

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "ok",
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        status: "error",
        responseTime: Date.now() - dbStart,
      };
    }

    // Determine overall status
    let status: HealthCheckResult["status"] = "ok";
    if (checks.database.status === "error") {
      status = "error";
    }

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}