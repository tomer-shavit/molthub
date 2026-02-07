import * as path from "node:path";
import { loadMiddlewares } from "../middleware-loader";
import type { ProxyConfig } from "../proxy-config";

const FIXTURES = path.join(__dirname, "fixtures");

function makeConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    externalPort: 18789,
    internalPort: 18790,
    middlewares: [],
    ...overrides,
  };
}

describe("loadMiddlewares", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("skips disabled middlewares", async () => {
    const config = makeConfig({
      middlewares: [{ package: "fake-pkg", enabled: false, config: {} }],
    });

    const result = await loadMiddlewares(config);

    expect(result).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping disabled")
    );
  });

  it("throws when package does not export factory function", async () => {
    const config = makeConfig({
      middlewares: [{
        package: path.join(FIXTURES, "not-a-factory.js"),
        enabled: true,
        config: {},
      }],
    });

    await expect(loadMiddlewares(config)).rejects.toThrow(
      "does not export a factory function"
    );
  });

  it("throws when middleware has no name property", async () => {
    const config = makeConfig({
      middlewares: [{
        package: path.join(FIXTURES, "no-name-middleware.js"),
        enabled: true,
        config: {},
      }],
    });

    await expect(loadMiddlewares(config)).rejects.toThrow(
      'does not have a valid "name" property'
    );
  });

  it("loads valid middleware from package", async () => {
    const config = makeConfig({
      middlewares: [{
        package: path.join(FIXTURES, "valid-middleware.js"),
        enabled: true,
        config: {},
      }],
    });

    const result = await loadMiddlewares(config);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("test-valid");
  });

  it("returns empty array for empty config", async () => {
    const result = await loadMiddlewares(makeConfig());

    expect(result).toHaveLength(0);
  });
});
