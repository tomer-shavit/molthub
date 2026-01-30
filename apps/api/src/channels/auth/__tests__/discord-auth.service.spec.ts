import { Test, TestingModule } from "@nestjs/testing";
import { DiscordAuthService } from "../discord-auth.service";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("DiscordAuthService", () => {
  let service: DiscordAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscordAuthService],
    }).compile();

    service = module.get<DiscordAuthService>(DiscordAuthService);
    jest.clearAllMocks();
  });

  describe("validateToken", () => {
    it("should validate a valid bot token and fetch guilds", async () => {
      // Mock /users/@me
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "123456789",
          username: "test-bot",
          discriminator: "0001",
          bot: true,
          avatar: null,
        }),
      });

      // Mock /users/@me/guilds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "guild-1",
            name: "Test Server",
            icon: null,
            owner: true,
            permissions: "8",
          },
          {
            id: "guild-2",
            name: "Another Server",
            icon: "abc123",
            owner: false,
            permissions: "0",
          },
        ],
      });

      const result = await service.validateToken("token.part.here");

      expect(result.state).toBe("paired");
      expect(result.botInfo).toBeDefined();
      expect(result.botInfo!.username).toBe("test-bot");
      expect(result.botInfo!.bot).toBe(true);
      expect(result.guilds).toHaveLength(2);
      expect(result.guilds![0].name).toBe("Test Server");
    });

    it("should reject empty token", async () => {
      const result = await service.validateToken("");

      expect(result.state).toBe("error");
      expect(result.error).toContain("required");
    });

    it("should reject invalid format (not 3 segments)", async () => {
      const result = await service.validateToken("invalid-single-segment");

      expect(result.state).toBe("error");
      expect(result.error).toContain("3 dot-separated segments");
    });

    it("should handle 401 unauthorized", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await service.validateToken("bad.token.here");

      expect(result.state).toBe("error");
      expect(result.error).toContain("401 Unauthorized");
    });

    it("should handle non-bot account", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "123",
          username: "user",
          discriminator: "0001",
          bot: false,
        }),
      });

      const result = await service.validateToken("user.token.here");

      expect(result.state).toBe("error");
      expect(result.error).toContain("does not belong to a bot");
    });

    it("should return empty guilds on guild fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "123",
          username: "test-bot",
          discriminator: "0001",
          bot: true,
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const result = await service.validateToken("valid.bot.token");

      expect(result.state).toBe("paired");
      expect(result.guilds).toEqual([]);
    });
  });

  describe("fetchGuildList", () => {
    it("should fetch guild list directly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "g1", name: "Server 1", icon: null, owner: false, permissions: "0" },
        ],
      });

      const guilds = await service.fetchGuildList("valid.bot.token");
      expect(guilds).toHaveLength(1);
    });
  });
});
