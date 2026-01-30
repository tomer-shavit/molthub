import {
  GatewayError,
  GatewayConnectionError,
  GatewayTimeoutError,
  GatewayAuthError,
} from "../errors";
import { GatewayErrorCode } from "../protocol";

describe("GatewayError", () => {
  it("extends Error", () => {
    const error = new GatewayError("test error", GatewayErrorCode.INVALID_REQUEST);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GatewayError);
  });

  it("has correct name", () => {
    const error = new GatewayError("test", GatewayErrorCode.NOT_LINKED);
    expect(error.name).toBe("GatewayError");
  });

  it("stores message and code", () => {
    const error = new GatewayError("something failed", GatewayErrorCode.AGENT_TIMEOUT);
    expect(error.message).toBe("something failed");
    expect(error.code).toBe(GatewayErrorCode.AGENT_TIMEOUT);
  });
});

describe("GatewayConnectionError", () => {
  it("extends GatewayError", () => {
    const error = new GatewayConnectionError("connection lost");
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name", () => {
    const error = new GatewayConnectionError("test");
    expect(error.name).toBe("GatewayConnectionError");
  });

  it("defaults to UNAVAILABLE code", () => {
    const error = new GatewayConnectionError("disconnected");
    expect(error.code).toBe(GatewayErrorCode.UNAVAILABLE);
  });

  it("accepts custom error code", () => {
    const error = new GatewayConnectionError("not linked", GatewayErrorCode.NOT_LINKED);
    expect(error.code).toBe(GatewayErrorCode.NOT_LINKED);
  });
});

describe("GatewayTimeoutError", () => {
  it("extends GatewayError", () => {
    const error = new GatewayTimeoutError("timed out");
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name", () => {
    const error = new GatewayTimeoutError("test");
    expect(error.name).toBe("GatewayTimeoutError");
  });

  it("defaults to AGENT_TIMEOUT code", () => {
    const error = new GatewayTimeoutError("request timed out");
    expect(error.code).toBe(GatewayErrorCode.AGENT_TIMEOUT);
  });

  it("accepts custom error code", () => {
    const error = new GatewayTimeoutError("timeout", GatewayErrorCode.UNAVAILABLE);
    expect(error.code).toBe(GatewayErrorCode.UNAVAILABLE);
  });
});

describe("GatewayAuthError", () => {
  it("extends GatewayError", () => {
    const error = new GatewayAuthError("auth failed");
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name", () => {
    const error = new GatewayAuthError("test");
    expect(error.name).toBe("GatewayAuthError");
  });

  it("defaults to UNAVAILABLE code", () => {
    const error = new GatewayAuthError("invalid token");
    expect(error.code).toBe(GatewayErrorCode.UNAVAILABLE);
  });

  it("accepts custom error code", () => {
    const error = new GatewayAuthError("bad auth", GatewayErrorCode.NOT_LINKED);
    expect(error.code).toBe(GatewayErrorCode.NOT_LINKED);
  });
});

describe("Error hierarchy", () => {
  it("all errors can be caught as GatewayError", () => {
    const errors = [
      new GatewayConnectionError("conn"),
      new GatewayTimeoutError("timeout"),
      new GatewayAuthError("auth"),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(GatewayError);
    }
  });

  it("errors are distinguishable by instanceof", () => {
    const conn = new GatewayConnectionError("conn");
    const timeout = new GatewayTimeoutError("timeout");
    const auth = new GatewayAuthError("auth");

    expect(conn).toBeInstanceOf(GatewayConnectionError);
    expect(conn).not.toBeInstanceOf(GatewayTimeoutError);
    expect(conn).not.toBeInstanceOf(GatewayAuthError);

    expect(timeout).toBeInstanceOf(GatewayTimeoutError);
    expect(auth).toBeInstanceOf(GatewayAuthError);
  });

  it("errors are catchable with try/catch", () => {
    try {
      throw new GatewayConnectionError("test");
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayConnectionError);
      expect((err as GatewayConnectionError).code).toBe(GatewayErrorCode.UNAVAILABLE);
    }
  });
});
