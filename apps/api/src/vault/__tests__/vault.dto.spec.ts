import { StoreSecretSchema, SecretKeySchema } from "../vault.dto";

describe("StoreSecretSchema", () => {
  describe("valid inputs", () => {
    it("accepts a valid key and value", () => {
      const result = StoreSecretSchema.safeParse({ key: "MY_API_KEY", value: "sk-abc123" });
      expect(result.success).toBe(true);
    });

    it("accepts key with hyphens", () => {
      const result = StoreSecretSchema.safeParse({ key: "my-api-key", value: "val" });
      expect(result.success).toBe(true);
    });

    it("accepts key with underscores", () => {
      const result = StoreSecretSchema.safeParse({ key: "MY_API_KEY", value: "val" });
      expect(result.success).toBe(true);
    });

    it("accepts single-character key starting with letter", () => {
      const result = StoreSecretSchema.safeParse({ key: "A", value: "val" });
      expect(result.success).toBe(true);
    });

    it("accepts max-length key (128 chars)", () => {
      const key = "A" + "b".repeat(127);
      const result = StoreSecretSchema.safeParse({ key, value: "val" });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("rejects key starting with a number", () => {
      const result = StoreSecretSchema.safeParse({ key: "1_KEY", value: "val" });
      expect(result.success).toBe(false);
    });

    it("rejects key starting with underscore", () => {
      const result = StoreSecretSchema.safeParse({ key: "_KEY", value: "val" });
      expect(result.success).toBe(false);
    });

    it("rejects empty key", () => {
      const result = StoreSecretSchema.safeParse({ key: "", value: "val" });
      expect(result.success).toBe(false);
    });

    it("rejects key exceeding 128 chars", () => {
      const key = "A" + "b".repeat(128);
      const result = StoreSecretSchema.safeParse({ key, value: "val" });
      expect(result.success).toBe(false);
    });

    it("rejects key with special characters", () => {
      const result = StoreSecretSchema.safeParse({ key: "my.key", value: "val" });
      expect(result.success).toBe(false);
    });

    it("rejects empty value", () => {
      const result = StoreSecretSchema.safeParse({ key: "KEY", value: "" });
      expect(result.success).toBe(false);
    });

    it("rejects value exceeding 65536 chars", () => {
      const value = "x".repeat(65537);
      const result = StoreSecretSchema.safeParse({ key: "KEY", value });
      expect(result.success).toBe(false);
    });

    it("rejects missing key field", () => {
      const result = StoreSecretSchema.safeParse({ value: "val" });
      expect(result.success).toBe(false);
    });

    it("rejects missing value field", () => {
      const result = StoreSecretSchema.safeParse({ key: "KEY" });
      expect(result.success).toBe(false);
    });
  });
});

describe("SecretKeySchema", () => {
  it("accepts a valid key", () => {
    expect(SecretKeySchema.safeParse("MY_API_KEY").success).toBe(true);
  });

  it("rejects key starting with number", () => {
    expect(SecretKeySchema.safeParse("1KEY").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(SecretKeySchema.safeParse("").success).toBe(false);
  });

  it("rejects key with dots", () => {
    expect(SecretKeySchema.safeParse("my.key").success).toBe(false);
  });

  it("rejects key exceeding 128 chars", () => {
    expect(SecretKeySchema.safeParse("A" + "b".repeat(128)).success).toBe(false);
  });
});
