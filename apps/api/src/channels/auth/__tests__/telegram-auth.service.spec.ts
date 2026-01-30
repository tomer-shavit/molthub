import { Test, TestingModule } from "@nestjs/testing";
import { TelegramAuthService } from "../telegram-auth.service";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("TelegramAuthService", () => {
  let service: TelegramAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramAuthService],
    }).compile();

    service = module.get<TelegramAuthService>(TelegramAuthService);
    jest.clearAllMocks();
  });

  describe("validateToken", () => {
    it("should validate a valid bot token", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            id: 123456789,
            isBot: true,
            firstName: "Test Bot",
            username: "test_bot",
            canJoinGroups: true,
            canReadAllGroupMessages: false,
            supportsInlineQueries: false,
          },
        }),
      });

      const result = await service.validateToken("123456789:ABCdefGhIjKlMnOpQrStUvWxYz");

      expect(result.state).toBe("paired");
      expect(result.botInfo).toBeDefined();
      expect(result.botInfo!.username).toBe("test_bot");
      expect(result.botInfo!.isBot).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot123456789:ABCdefGhIjKlMnOpQrStUvWxYz/getMe",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should reject empty token", async () => {
      const result = await service.validateToken("");

      expect(result.state).toBe("error");
      expect(result.error).toContain("required");
    });

    it("should reject invalid format token", async () => {
      const result = await service.validateToken("invalid-token");

      expect(result.state).toBe("error");
      expect(result.error).toContain("format");
    });

    it("should handle invalid token API response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          ok: false,
          description: "Unauthorized",
        }),
      });

      const result = await service.validateToken("123456789:invalidhash");

      expect(result.state).toBe("error");
      expect(result.error).toContain("Unauthorized");
    });

    it("should handle non-bot account", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            id: 123456789,
            isBot: false,
            firstName: "Not A Bot",
            username: "regular_user",
          },
        }),
      });

      const result = await service.validateToken("123456789:ABCdefGhIjKlMnOp");

      expect(result.state).toBe("error");
      expect(result.error).toContain("not belong to a bot");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await service.validateToken("123456789:ABCdefGhIjKlMnOp");

      expect(result.state).toBe("error");
      expect(result.error).toContain("Network error");
    });

    it("should handle timeout errors", async () => {
      mockFetch.mockRejectedValue(new Error("The operation was aborted due to timeout"));

      const result = await service.validateToken("123456789:ABCdefGhIjKlMnOp");

      expect(result.state).toBe("error");
      expect(result.error).toContain("timed out");
    });
  });
});
