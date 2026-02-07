import * as http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { MiddlewareChain } from "./middleware-chain";
import { HttpForwarder } from "./http-forwarder";
import { processInboundFrame, processOutboundFrame } from "./ws-frame-processor";

export interface ProxyServerOptions {
  chain: MiddlewareChain;
  externalPort: number;
  internalPort: number;
  internalHost?: string;
}

export class ProxyServer {
  private readonly externalPort: number;
  private readonly internalPort: number;
  private readonly internalHost: string;
  private readonly chain: MiddlewareChain;
  private readonly httpForwarder: HttpForwarder;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(options: ProxyServerOptions) {
    this.chain = options.chain;
    this.externalPort = options.externalPort;
    this.internalPort = options.internalPort;
    this.internalHost = options.internalHost ?? "127.0.0.1";
    this.httpForwarder = new HttpForwarder(this.chain, {
      host: this.internalHost,
      port: this.internalPort,
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = http.createServer((req, res) => {
        this.httpForwarder.handle(req, res);
      });

      this.wss = new WebSocketServer({ server: this.httpServer });
      this.wss.on("connection", (clientWs, req) => {
        this.handleWsConnection(clientWs, req);
      });

      this.httpServer.listen(this.externalPort, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close(1001, "Proxy shutting down");
      }
      this.wss.close();
      this.wss = null;
    }

    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
        this.httpServer = null;
      } else {
        resolve();
      }
    });
  }

  private handleWsConnection(
    clientWs: WebSocket,
    req: http.IncomingMessage
  ): void {
    const upstreamUrl = `ws://${this.internalHost}:${this.internalPort}${req.url ?? "/"}`;
    const upstream = new WebSocket(upstreamUrl, {
      headers: { ...req.headers, host: `${this.internalHost}:${this.internalPort}` },
    });

    let upstreamReady = false;
    const buffer: (string | Buffer)[] = [];

    upstream.on("error", () => {
      clientWs.close(1011, "Upstream connection failed");
    });

    upstream.on("open", () => {
      upstreamReady = true;
      for (const msg of buffer) upstream.send(msg);
      buffer.length = 0;
    });

    clientWs.on("message", async (data, isBinary) => {
      const result = await processInboundFrame(data, isBinary, this.chain);
      if (result.action === "blocked") return;
      if (upstreamReady && upstream.readyState === WebSocket.OPEN) {
        upstream.send(result.data);
      } else if (!upstreamReady) {
        buffer.push(result.data);
      }
    });

    upstream.on("message", async (data, isBinary) => {
      const result = await processOutboundFrame(data, isBinary, this.chain);
      if (result.action === "blocked") return;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(result.data);
      }
    });

    clientWs.on("close", () => {
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    upstream.on("close", () => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });
  }
}
