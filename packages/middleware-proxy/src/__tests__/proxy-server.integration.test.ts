import * as http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { MiddlewareChain } from "../middleware-chain";
import { ProxyServer } from "../proxy-server";
import { BoomMiddleware } from "@clawster/middleware-boom";

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForWsOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
}

function waitForWsMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(data.toString()));
  });
}

describe("ProxyServer integration", () => {
  let upstreamPort: number;
  let proxyPort: number;
  let upstreamWss: WebSocketServer;
  let upstreamServer: http.Server;
  let proxy: ProxyServer;

  beforeEach(async () => {
    [upstreamPort, proxyPort] = await Promise.all([findFreePort(), findFreePort()]);

    // Create mock upstream (fake OpenClaw)
    upstreamServer = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    upstreamWss = new WebSocketServer({ server: upstreamServer });

    await new Promise<void>((resolve) => {
      upstreamServer.listen(upstreamPort, resolve);
    });

    const chain = new MiddlewareChain([new BoomMiddleware()]);
    proxy = new ProxyServer({
      chain,
      externalPort: proxyPort,
      internalPort: upstreamPort,
      internalHost: "127.0.0.1",
    });

    await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
    upstreamWss.close();
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it("appends BOOM to agent completion responses", async () => {
    const completionFrame = JSON.stringify({
      type: "res",
      id: "test-1",
      ok: true,
      payload: {
        runId: "run-1",
        status: "completed",
        result: { payloads: [{ text: "Hello there!" }] },
      },
    });

    // When upstream connects, send completion frame
    upstreamWss.on("connection", (upstream) => {
      upstream.send(completionFrame);
    });

    const client = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
    await waitForWsOpen(client);

    const received = await waitForWsMessage(client);
    const parsed = JSON.parse(received);

    expect(parsed.payload.result.payloads[0].text).toBe("Hello there! BOOM");
    expect(parsed.id).toBe("test-1");
    expect(parsed.payload.runId).toBe("run-1");

    client.close();
  });

  it("passes ack responses unchanged", async () => {
    const ackFrame = JSON.stringify({
      type: "res",
      id: "test-2",
      ok: true,
      payload: { runId: "run-2", status: "accepted", acceptedAt: 123 },
    });

    upstreamWss.on("connection", (upstream) => {
      upstream.send(ackFrame);
    });

    const client = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
    await waitForWsOpen(client);

    const received = await waitForWsMessage(client);

    // Should be the original unchanged (raw passthrough)
    expect(received).toBe(ackFrame);

    client.close();
  });

  it("passes event frames unchanged", async () => {
    const eventFrame = JSON.stringify({
      type: "event",
      event: "agentOutput",
      payload: { requestId: "req-1", seq: 0, chunk: "hello" },
    });

    upstreamWss.on("connection", (upstream) => {
      upstream.send(eventFrame);
    });

    const client = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
    await waitForWsOpen(client);

    const received = await waitForWsMessage(client);

    expect(received).toBe(eventFrame);

    client.close();
  });

  it("forwards client requests to upstream", async () => {
    const requestFrame = JSON.stringify({
      type: "req",
      id: "req-1",
      method: "agent",
      params: { message: "hello" },
    });

    const upstreamReceived = new Promise<string>((resolve) => {
      upstreamWss.on("connection", (upstream) => {
        upstream.on("message", (data) => resolve(data.toString()));
      });
    });

    const client = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
    await waitForWsOpen(client);
    client.send(requestFrame);

    const received = await upstreamReceived;

    expect(received).toBe(requestFrame);

    client.close();
  });

  it("proxies HTTP GET /health to upstream", async () => {
    const response = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      http.get(`http://127.0.0.1:${proxyPort}/health`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode!, body }));
      });
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
  });

  it("returns proxy health on /__proxy/health", async () => {
    const response = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      http.get(`http://127.0.0.1:${proxyPort}/__proxy/health`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode!, body }));
      });
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok", proxy: true });
  });

  it("closes upstream when client disconnects", async () => {
    const upstreamClosed = new Promise<void>((resolve) => {
      upstreamWss.on("connection", (upstream) => {
        upstream.on("close", () => resolve());
      });
    });

    const client = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
    await waitForWsOpen(client);

    // Wait a tick for upstream connection to establish
    await new Promise((r) => setTimeout(r, 50));

    client.close();

    // Upstream should close within reasonable time
    await Promise.race([
      upstreamClosed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000)),
    ]);
  });
});
