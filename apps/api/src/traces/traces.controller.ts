import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { Trace } from "@molthub/database";
import { TracesService } from "./traces.service";
import { CreateTraceDto, ListTracesQueryDto } from "./traces.dto";

@Controller("traces")
export class TracesController {
  constructor(private readonly tracesService: TracesService) {}

  @Post()
  create(@Body() dto: CreateTraceDto): Promise<Trace> {
    return this.tracesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListTracesQueryDto): Promise<Trace[]> {
    return this.tracesService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Trace> {
    return this.tracesService.findOne(id);
  }

  @Get("by-trace-id/:traceId")
  findByTraceId(@Param("traceId") traceId: string): Promise<Trace & { children: Trace[] }> {
    return this.tracesService.findByTraceId(traceId);
  }

  @Get("by-trace-id/:traceId/tree")
  getTraceTree(@Param("traceId") traceId: string): Promise<Record<string, unknown>> {
    return this.tracesService.getTraceTree(traceId);
  }

  @Get("stats/:botInstanceId")
  getStats(
    @Param("botInstanceId") botInstanceId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ): Promise<Record<string, unknown>> {
    return this.tracesService.getStats(
      botInstanceId,
      new Date(from),
      new Date(to)
    );
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @Body("output") output?: Record<string, unknown>): Promise<Trace> {
    return this.tracesService.complete(id, output);
  }

  @Post(":id/fail")
  fail(@Param("id") id: string, @Body("error") error: Record<string, unknown>): Promise<Trace> {
    return this.tracesService.fail(id, error);
  }
}
