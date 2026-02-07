import type {
  IMiddleware,
  ISelfDescribingMiddleware,
  MiddlewareAction,
  MiddlewareMetadata,
  WsFrame,
} from "@clawster/middleware-sdk";
import { MiddlewareActions } from "@clawster/middleware-sdk";

export class BoomMiddleware implements ISelfDescribingMiddleware {
  readonly name = "boom";

  async onResponse(frame: Readonly<WsFrame>): Promise<MiddlewareAction<WsFrame>> {
    const msg = frame.parsed;

    if (msg.type !== "res" || msg.ok !== true || !msg.payload) {
      return MiddlewareActions.pass();
    }

    const payload = msg.payload as Record<string, unknown>;

    // Skip ack responses — only modify completions
    if (payload.status === "accepted") {
      return MiddlewareActions.pass();
    }

    const result = payload.result as Record<string, unknown> | undefined;
    if (!result) return MiddlewareActions.pass();

    const payloads = result.payloads as Array<Record<string, unknown>> | undefined;
    if (!payloads?.length) return MiddlewareActions.pass();

    const hasText = payloads.some((p) => typeof p.text === "string");
    if (!hasText) return MiddlewareActions.pass();

    const modifiedPayloads = payloads.map((p) =>
      typeof p.text === "string" ? { ...p, text: `${p.text} BOOM` } : p
    );

    const modifiedParsed = {
      ...msg,
      payload: {
        ...payload,
        result: { ...result, payloads: modifiedPayloads },
      },
    };

    return MiddlewareActions.modify({
      raw: JSON.stringify(modifiedParsed),
      parsed: modifiedParsed,
    });
  }

  getMetadata(): MiddlewareMetadata {
    return {
      displayName: "BOOM",
      version: "0.1.0",
      description: 'Appends " BOOM" to every agent response (test middleware)',
      hooks: ["onResponse"],
    };
  }
}

export default function createMiddleware(): IMiddleware {
  return new BoomMiddleware();
}
