import * as http from "node:http";
import { URL } from "node:url";
import type { HttpRequest, HttpResponse } from "@clawster/middleware-sdk";
import type { MiddlewareChain } from "./middleware-chain";

export interface UpstreamTarget {
  readonly host: string;
  readonly port: number;
}

export class HttpForwarder {
  constructor(
    private readonly chain: MiddlewareChain,
    private readonly upstream: UpstreamTarget
  ) {}

  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    if (req.url === "/__proxy/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", proxy: true }));
      return;
    }

    const body = await collectBody(req);
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);

    const httpReq: HttpRequest = {
      method: req.method ?? "GET",
      path: parsedUrl.pathname,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
    };

    const processedReq = await this.chain.processHttpRequest(httpReq);
    if (processedReq === null) {
      sendBlocked(res);
      return;
    }

    await this.forward(processedReq, res);
  }

  private async forward(
    proxyReq: HttpRequest,
    clientRes: http.ServerResponse
  ): Promise<void> {
    return new Promise((resolve) => {
      const upstreamHost = `${this.upstream.host}:${this.upstream.port}`;
      const upstreamReq = http.request(
        {
          hostname: this.upstream.host,
          port: this.upstream.port,
          path: proxyReq.path,
          method: proxyReq.method,
          headers: { ...proxyReq.headers, host: upstreamHost },
        },
        async (upstreamRes) => {
          try {
            const body = await collectBody(upstreamRes);

            const httpRes: HttpResponse = {
              statusCode: upstreamRes.statusCode ?? 500,
              headers: upstreamRes.headers as Record<string, string | string[] | undefined>,
              body,
            };

            const processed = await this.chain.processHttpResponse(httpRes);
            if (processed === null) {
              sendBlocked(clientRes);
            } else {
              clientRes.writeHead(processed.statusCode, processed.headers);
              clientRes.end(processed.body);
            }
          } catch {
            clientRes.writeHead(502, { "Content-Type": "application/json" });
            clientRes.end(JSON.stringify({ error: "Bad gateway" }));
          }
          resolve();
        }
      );

      upstreamReq.on("error", () => {
        clientRes.writeHead(502, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({ error: "Bad gateway" }));
        resolve();
      });

      upstreamReq.end(proxyReq.body);
    });
  }
}

function collectBody(stream: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function sendBlocked(res: http.ServerResponse): void {
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Blocked by middleware" }));
}
