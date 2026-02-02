import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Trace } from "@clawster/database";
import type { A2aTask, A2aMessage, TaskState } from "./a2a.types";

@Injectable()
export class A2aTaskService {
  /**
   * Get a single A2A task by its task ID (= Trace.traceId), scoped to a bot.
   */
  async getTask(
    botInstanceId: string,
    taskId: string,
    historyLength?: number,
  ): Promise<A2aTask> {
    const trace = await prisma.trace.findFirst({
      where: {
        traceId: taskId,
        botInstanceId,
      },
    });

    if (!trace) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    return this.traceToTask(trace, historyLength);
  }

  /**
   * List recent A2A tasks for a bot instance.
   */
  async listTasks(botInstanceId: string): Promise<A2aTask[]> {
    const traces = await prisma.trace.findMany({
      where: {
        botInstanceId,
        type: "TASK",
        name: { startsWith: "a2a:" },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return traces.map((t) => this.traceToTask(t));
  }

  /**
   * Transform a Trace record into an A2A Task object.
   */
  private traceToTask(trace: Trace, historyLength?: number): A2aTask {
    const metadata = this.parseJson(trace.metadata);
    const input = this.parseJson(trace.input);
    const output = this.parseJson(trace.output);

    const contextId = String(metadata?.contextId || trace.traceId);
    const state = this.mapStatus(trace.status);

    // Build status message from output
    const outputText =
      output?.output || output?.error || null;
    const statusMessage: A2aMessage | undefined = outputText
      ? {
          messageId: `${trace.traceId}-response`,
          role: "agent",
          parts: [{ text: String(outputText) }],
        }
      : undefined;

    // Build history if requested
    let history: A2aMessage[] | undefined;
    if (historyLength === undefined || historyLength > 0) {
      history = [];
      if (input?.text) {
        history.push({
          messageId: String(input.messageId || `${trace.traceId}-input`),
          role: "user",
          parts: [{ text: String(input.text) }],
        });
      }
      if (outputText) {
        history.push({
          messageId: `${trace.traceId}-response`,
          role: "agent",
          parts: [{ text: String(outputText) }],
        });
      }
      if (historyLength !== undefined) {
        history = history.slice(-historyLength);
      }
    }

    return {
      id: trace.traceId,
      contextId,
      status: {
        state,
        message: statusMessage,
        timestamp: (trace.endedAt || trace.startedAt).toISOString(),
      },
      ...(history && history.length > 0 ? { history } : {}),
      metadata: {
        startedAt: trace.startedAt.toISOString(),
        endedAt: trace.endedAt?.toISOString() || null,
        durationMs: trace.durationMs,
        inputText: input?.text || null,
      },
    };
  }

  private mapStatus(traceStatus: string): TaskState {
    switch (traceStatus) {
      case "SUCCESS":
        return "completed";
      case "ERROR":
        return "failed";
      case "PENDING":
        return "working";
      default:
        return "working";
    }
  }

  private parseJson(value: string | null | undefined): Record<string, unknown> | null {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
