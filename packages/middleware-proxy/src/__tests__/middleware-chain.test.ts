import type { IMiddleware, MiddlewareAction, WsFrame, IMiddlewareContext } from "@clawster/middleware-sdk";
import { MiddlewareActions } from "@clawster/middleware-sdk";
import { MiddlewareChain } from "../middleware-chain";

function makeFrame(parsed: Record<string, unknown>): WsFrame {
  return { raw: JSON.stringify(parsed), parsed };
}

function createMockMiddleware(
  name: string,
  hooks: Partial<Pick<IMiddleware, "onRequest" | "onResponse" | "initialize" | "destroy">> = {}
): IMiddleware {
  return { name, ...hooks };
}

describe("MiddlewareChain", () => {
  describe("processResponse", () => {
    it("returns frame unchanged when middleware returns pass", async () => {
      const mw = createMockMiddleware("pass-mw", {
        onResponse: async () => MiddlewareActions.pass(),
      });
      const chain = new MiddlewareChain([mw]);
      const frame = makeFrame({ type: "res", ok: true });

      const result = await chain.processResponse(frame);

      expect(result).toBe(frame);
    });

    it("returns modified frame when middleware returns modify", async () => {
      const modified = makeFrame({ type: "res", ok: true, modified: true });
      const mw = createMockMiddleware("modify-mw", {
        onResponse: async () => MiddlewareActions.modify(modified),
      });
      const chain = new MiddlewareChain([mw]);
      const frame = makeFrame({ type: "res", ok: true });

      const result = await chain.processResponse(frame);

      expect(result).toBe(modified);
    });

    it("returns null when middleware returns block", async () => {
      const mw = createMockMiddleware("block-mw", {
        onResponse: async () => MiddlewareActions.block("test reason"),
      });
      const chain = new MiddlewareChain([mw]);
      const frame = makeFrame({ type: "res", ok: true });

      const result = await chain.processResponse(frame);

      expect(result).toBeNull();
    });

    it("executes middlewares in order — second sees modified data from first", async () => {
      const received: Record<string, unknown>[] = [];

      const mw1 = createMockMiddleware("first", {
        onResponse: async (frame) => {
          received.push(frame.parsed);
          return MiddlewareActions.modify(makeFrame({ ...frame.parsed, step: 1 }));
        },
      });
      const mw2 = createMockMiddleware("second", {
        onResponse: async (frame) => {
          received.push(frame.parsed);
          return MiddlewareActions.pass();
        },
      });
      const chain = new MiddlewareChain([mw1, mw2]);

      await chain.processResponse(makeFrame({ type: "res" }));

      expect(received[0]).toEqual({ type: "res" });
      expect(received[1]).toEqual({ type: "res", step: 1 });
    });

    it("stops chain on block — subsequent middlewares not called", async () => {
      const called: string[] = [];

      const mw1 = createMockMiddleware("blocker", {
        onResponse: async () => {
          called.push("blocker");
          return MiddlewareActions.block();
        },
      });
      const mw2 = createMockMiddleware("after", {
        onResponse: async () => {
          called.push("after");
          return MiddlewareActions.pass();
        },
      });
      const chain = new MiddlewareChain([mw1, mw2]);

      await chain.processResponse(makeFrame({ type: "res" }));

      expect(called).toEqual(["blocker"]);
    });

    it("skips middleware without the relevant hook", async () => {
      const mw = createMockMiddleware("no-hook");
      const chain = new MiddlewareChain([mw]);
      const frame = makeFrame({ type: "res" });

      const result = await chain.processResponse(frame);

      expect(result).toBe(frame);
    });

    it("isolates errors — continues with unmodified data on throw", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const mw1 = createMockMiddleware("thrower", {
        onResponse: async () => {
          throw new Error("boom");
        },
      });
      const mw2 = createMockMiddleware("after", {
        onResponse: async () => MiddlewareActions.pass(),
      });
      const chain = new MiddlewareChain([mw1, mw2]);
      const frame = makeFrame({ type: "res" });

      const result = await chain.processResponse(frame);

      expect(result).toBe(frame);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("thrower"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("processRequest", () => {
    it("processes request frames through onRequest hooks", async () => {
      const modified = makeFrame({ type: "req", tagged: true });
      const mw = createMockMiddleware("req-mw", {
        onRequest: async () => MiddlewareActions.modify(modified),
      });
      const chain = new MiddlewareChain([mw]);

      const result = await chain.processRequest(makeFrame({ type: "req" }));

      expect(result).toBe(modified);
    });
  });

  describe("initializeAll", () => {
    it("calls initialize on all middlewares", async () => {
      const contexts: IMiddlewareContext[] = [];
      const mw1 = createMockMiddleware("mw1", {
        initialize: async (ctx) => { contexts.push(ctx); },
      });
      const mw2 = createMockMiddleware("mw2", {
        initialize: async (ctx) => { contexts.push(ctx); },
      });
      const chain = new MiddlewareChain([mw1, mw2]);

      const ctx: IMiddlewareContext = {
        botName: "test",
        externalPort: 18789,
        internalPort: 18790,
        middlewareConfig: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      };

      await chain.initializeAll(ctx);

      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toBe(ctx);
    });
  });

  describe("destroyAll", () => {
    it("calls destroy on all middlewares and swallows errors", async () => {
      const destroyed: string[] = [];
      const mw1 = createMockMiddleware("mw1", {
        destroy: async () => { destroyed.push("mw1"); throw new Error("fail"); },
      });
      const mw2 = createMockMiddleware("mw2", {
        destroy: async () => { destroyed.push("mw2"); },
      });
      const chain = new MiddlewareChain([mw1, mw2]);

      await chain.destroyAll();

      expect(destroyed).toEqual(["mw1", "mw2"]);
    });
  });
});
