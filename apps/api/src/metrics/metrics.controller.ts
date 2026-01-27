import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Response } from "express";
import { MetricsService } from "./metrics.service";

@ApiTags("metrics")
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: "Get Prometheus metrics" })
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.collectMetrics();
    res.setHeader("Content-Type", "text/plain");
    res.send(metrics);
  }
}