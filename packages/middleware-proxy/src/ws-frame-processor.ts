import type { WsFrame } from "@clawster/middleware-sdk";
import type { MiddlewareChain } from "./middleware-chain";

export type ProcessResult =
  | { action: "send"; data: string | Buffer }
  | { action: "blocked" };

type ChainMethod = (frame: WsFrame) => Promise<WsFrame | null>;

async function processFrame(
  data: Buffer | ArrayBuffer | Buffer[],
  isBinary: boolean,
  chainMethod: ChainMethod
): Promise<ProcessResult> {
  if (isBinary) {
    return { action: "send", data: data as Buffer };
  }

  const raw = data.toString();
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { action: "send", data: raw };
  }

  const frame: WsFrame = { raw, parsed };
  const result = await chainMethod(frame);

  if (result === null) return { action: "blocked" };

  return {
    action: "send",
    data: result === frame ? frame.raw : JSON.stringify(result.parsed),
  };
}

export function processInboundFrame(
  data: Buffer | ArrayBuffer | Buffer[],
  isBinary: boolean,
  chain: MiddlewareChain
): Promise<ProcessResult> {
  return processFrame(data, isBinary, (f) => chain.processRequest(f));
}

export function processOutboundFrame(
  data: Buffer | ArrayBuffer | Buffer[],
  isBinary: boolean,
  chain: MiddlewareChain
): Promise<ProcessResult> {
  return processFrame(data, isBinary, (f) => chain.processResponse(f));
}
