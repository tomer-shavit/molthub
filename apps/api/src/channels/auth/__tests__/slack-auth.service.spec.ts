import { Test, TestingModule } from "@nestjs/testing";
import { SlackAuthService } from "../slack-auth.service";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("SlackAuthService", () => {
  let service: SlackAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlackAuthService],
    }).compile();

    service = module.get<SlackAuthService>(SlackAuthService);
    jest.clearAllMocks();
  });

  describe("validateTokens", () => {
    it("should validate both bot and app tokens successfully", async () => {
      // Mock auth.test
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bot_id: "B123",
          team_id: "T456",
          team: "Test Workspace",
          user_id: "U789",
          url: "https://test-workspace.slack.com/",
        }),
      });

      // Mock apps.connections.open
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          url: "wss://wss-primary.slack.com/link/?ticket=...",
        }),
      });

      const result = await service.validateTokens("xoxb-valid", "xapp-valid");

      expect(result.state).toBe("paired");
      expect(result.botInfo).toBeDefined();
      expect(result.botInfo!.teamName).toBe("Test Workspace");
      expect(result.socketModeValid).toBe(true);
    });

    it("should reject empty bot token", async () => {
      const result = await service.validateTokens("", "xapp-valid");

      expect(result.state).toBe("error");
      expect(result.error).toContain("bot token");
    });

    it("should reject empty app token", async () => {
      const result = await service.validateTokens("xoxb-valid", "");

      expect(result.state).toBe("error");
      expect(result.error).toContain("app-level token");
    });

    it("should reject user token (xoxp-)", async () => {
      const result = await service.validateTokens("xoxp-user-token", "xapp-valid");

      expect(result.state).toBe("error");
      expect(result.error).toContain("User token");
    });

    it("should reject invalid bot token prefix", async () => {
      const result = await service.validateTokens("invalid-prefix", "xapp-valid");

      expect(result.state).toBe("error");
      expect(result.error).toContain("xoxb-");
    });

    it("should reject invalid app token prefix", async () => {
      const result = await service.validateTokens("xoxb-valid", "invalid-prefix");

      expect(result.state).toBe("error");
      expect(result.error).toContain("xapp-");
    });

    it("should handle invalid bot token from API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: "invalid_auth",
        }),
      });

      const result = await service.validateTokens("xoxb-invalid", "xapp-valid");

      expect(result.state).toBe("error");
      expect(result.error).toContain("Invalid Slack bot token");
    });

    it("should handle Socket Mode failure with valid bot token", async () => {
      // auth.test succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bot_id: "B123",
          team_id: "T456",
          team: "Test Workspace",
          user_id: "U789",
          url: "https://test.slack.com/",
        }),
      });

      // apps.connections.open fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: "not_allowed_token_type",
        }),
      });

      const result = await service.validateTokens("xoxb-valid", "xapp-bad");

      expect(result.state).toBe("error");
      expect(result.botInfo).toBeDefined();
      expect(result.socketModeValid).toBe(false);
      expect(result.error).toContain("Socket Mode");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network unavailable"));

      const result = await service.validateTokens("xoxb-valid", "xapp-valid");

      expect(result.state).toBe("error");
      expect(result.error).toContain("Network unavailable");
    });
  });

  describe("validateBotTokenOnly", () => {
    it("should validate just the bot token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bot_id: "B123",
          team_id: "T456",
          team: "Workspace",
          user_id: "U789",
          url: "https://workspace.slack.com/",
        }),
      });

      const result = await service.validateBotTokenOnly("xoxb-valid");

      expect(result.state).toBe("pending");
      expect(result.botInfo).toBeDefined();
    });

    it("should reject invalid bot token format", async () => {
      const result = await service.validateBotTokenOnly("bad-token");

      expect(result.state).toBe("error");
    });
  });
});
