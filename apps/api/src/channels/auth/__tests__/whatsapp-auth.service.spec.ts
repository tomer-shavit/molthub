import { Test, TestingModule } from "@nestjs/testing";
import { WhatsAppAuthService } from "../whatsapp-auth.service";

describe("WhatsAppAuthService", () => {
  let service: WhatsAppAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppAuthService],
    }).compile();

    service = module.get<WhatsAppAuthService>(WhatsAppAuthService);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("startPairing", () => {
    it("should start a new pairing session with QR code", async () => {
      const result = await service.startPairing("channel-1");

      expect(result.state).toBe("pairing");
      expect(result.qrCode).toBeDefined();
      expect(result.qrCode).toContain("moltbot-wa-qr://channel-1/");
      expect(result.qrExpiresAt).toBeDefined();
      expect(result.qrExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("should start a pairing session with botInstanceId", async () => {
      const result = await service.startPairing("channel-1", "bot-1");

      expect(result.state).toBe("pairing");
      expect(result.qrCode).toBeDefined();
    });

    it("should cancel existing session when starting a new one", async () => {
      await service.startPairing("channel-1");
      const result = await service.startPairing("channel-1");

      expect(result.state).toBe("pairing");
      expect(result.qrCode).toBeDefined();
    });
  });

  describe("refreshQr", () => {
    it("should refresh QR code for active session", async () => {
      await service.startPairing("channel-1");
      const result = await service.refreshQr("channel-1");

      expect(result.state).toBe("pairing");
      expect(result.qrCode).toBeDefined();
    });

    it("should return expired state for non-existent session", async () => {
      const result = await service.refreshQr("nonexistent");

      expect(result.state).toBe("expired");
      expect(result.error).toContain("No active pairing session");
    });

    it("should return paired state if already paired", async () => {
      await service.startPairing("channel-1");
      service.completePairing("channel-1");
      const result = await service.refreshQr("channel-1");

      expect(result.state).toBe("paired");
    });
  });

  describe("getSessionStatus", () => {
    it("should return pending for non-existent session", () => {
      const result = service.getSessionStatus("nonexistent");
      expect(result.state).toBe("pending");
    });

    it("should return current session state", async () => {
      await service.startPairing("channel-1");
      const result = service.getSessionStatus("channel-1");

      expect(result.state).toBe("pairing");
      expect(result.qrCode).toBeDefined();
    });
  });

  describe("completePairing", () => {
    it("should mark session as paired", async () => {
      await service.startPairing("channel-1");
      const result = service.completePairing("channel-1");

      expect(result.state).toBe("paired");
      expect(result.qrCode).toBeUndefined();
    });

    it("should return error for non-existent session", () => {
      const result = service.completePairing("nonexistent");
      expect(result.state).toBe("error");
    });
  });

  describe("failPairing", () => {
    it("should mark session as error with message", async () => {
      await service.startPairing("channel-1");
      const result = service.failPairing("channel-1", "Connection lost");

      expect(result.state).toBe("error");
      expect(result.error).toBe("Connection lost");
    });

    it("should return error for non-existent session", () => {
      const result = service.failPairing("nonexistent", "Error");
      expect(result.state).toBe("error");
    });
  });
});
