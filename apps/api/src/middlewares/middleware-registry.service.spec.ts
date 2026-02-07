import { NotFoundException } from "@nestjs/common";
import { MiddlewareRegistryService } from "./middleware-registry.service";

describe("MiddlewareRegistryService", () => {
  let service: MiddlewareRegistryService;

  beforeEach(() => {
    service = new MiddlewareRegistryService();
  });

  describe("findAll", () => {
    it("returns all registry entries", () => {
      const result = service.findAll();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        id: "@clawster/middleware-boom",
        displayName: "BOOM",
        hooks: ["onResponse"],
      });
    });

    it("returns a new array (immutable)", () => {
      const a = service.findAll();
      const b = service.findAll();
      expect(a).not.toBe(b);
    });
  });

  describe("findById", () => {
    it("returns the entry by id", () => {
      const entry = service.findById("@clawster/middleware-boom");
      expect(entry.id).toBe("@clawster/middleware-boom");
      expect(entry.displayName).toBe("BOOM");
    });

    it("returns a copy (immutable)", () => {
      const a = service.findById("@clawster/middleware-boom");
      const b = service.findById("@clawster/middleware-boom");
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it("throws NotFoundException for unknown id", () => {
      expect(() => service.findById("nonexistent")).toThrow(NotFoundException);
    });
  });
});
