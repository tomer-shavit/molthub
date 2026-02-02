import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@clawster/database";
import {
  OpenClawChannelType,
  CHANNEL_TYPE_META,
  NODE_REQUIRED_CHANNELS,
  QR_PAIRING_CHANNELS,
} from "./channel-types";
import { ChannelAuthFactory } from "./auth/auth-factory";

// ============================================
// Auth Session (in-memory until ChannelAuthSession model lands via WP-06)
// ============================================

type ChannelAuthState = string;

export interface AuthSession {
  id: string;
  channelId: string;
  openclawType: OpenClawChannelType;
  state: ChannelAuthState;
  qrCode?: string;
  qrExpiresAt?: Date;
  pairingUrl?: string;
  error?: string;
  startedAt: Date;
  expiresAt: Date;
  botInstanceId?: string;
  /** Platform-specific details returned from real auth validation */
  platformDetails?: Record<string, unknown>;
}

@Injectable()
export class ChannelAuthService {
  private readonly logger = new Logger(ChannelAuthService.name);

  /** In-memory auth session store. Keyed by channelId. */
  private sessions = new Map<string, AuthSession>();

  /** QR pairing session timeout in ms (5 minutes) */
  private readonly QR_TIMEOUT_MS = 5 * 60 * 1000;

  /** Token auth session timeout in ms (15 minutes) */
  private readonly TOKEN_TIMEOUT_MS = 15 * 60 * 1000;

  constructor(private readonly authFactory: ChannelAuthFactory) {}

  // ==========================================
  // Start Auth Flow
  // ==========================================

  async startAuth(
    channelId: string,
    botInstanceId?: string,
  ): Promise<AuthSession> {
    // Verify the channel exists
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const config = (typeof channel.config === "string" ? JSON.parse(channel.config) : channel.config) as Record<string, unknown>;
    const openclawType = config?.openclawType as OpenClawChannelType | undefined;

    if (!openclawType) {
      throw new BadRequestException(
        `Channel ${channelId} does not have an openclawType configured`,
      );
    }

    // Runtime compatibility check for Node-required channels
    if (botInstanceId && NODE_REQUIRED_CHANNELS.includes(openclawType)) {
      await this.validateRuntimeCompatibility(botInstanceId, openclawType);
    }

    // Check if there is already an active (non-expired, non-error) session
    const existing = this.sessions.get(channelId);
    if (existing && existing.state !== "expired" && existing.state !== "error") {
      // Expire the old session before starting a new one
      existing.state = "expired";
    }

    const now = new Date();
    const isQrPairing = QR_PAIRING_CHANNELS.includes(openclawType);
    const timeoutMs = isQrPairing ? this.QR_TIMEOUT_MS : this.TOKEN_TIMEOUT_MS;

    const session: AuthSession = {
      id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      channelId,
      openclawType,
      state: "pending",
      startedAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
      botInstanceId,
    };

    // Delegate to platform-specific auth service via factory
    if (isQrPairing) {
      const result = await this.authFactory.validateCredentials({
        channelType: openclawType,
        channelId,
        botInstanceId,
      });

      session.state = result.state;
      if ("qrCode" in result && result.qrCode) {
        session.qrCode = result.qrCode;
      }
      if ("qrExpiresAt" in result && result.qrExpiresAt) {
        session.qrExpiresAt = result.qrExpiresAt as Date;
      }
      session.pairingUrl = `openclaw://pair/${openclawType}/${channelId}`;
      if (result.error) {
        session.error = result.error;
      }
    } else if (CHANNEL_TYPE_META[openclawType].authMethod === "token") {
      // For token-based channels, check if required secrets are already present
      const secrets = (config?.secrets as Record<string, string>) || undefined;
      const meta = CHANNEL_TYPE_META[openclawType];
      const hasAllSecrets = meta.requiredSecrets.every(
        (s) => secrets?.[s] && secrets[s].length > 0,
      );
      if (hasAllSecrets) {
        session.state = "paired";
      } else {
        session.state = "pending";
      }
    } else {
      session.state = "pending";
    }

    this.sessions.set(channelId, session);

    // Schedule expiration
    setTimeout(() => {
      const s = this.sessions.get(channelId);
      if (s && s.id === session.id && s.state !== "paired") {
        s.state = "expired";
      }
    }, timeoutMs);

    return session;
  }

  // ==========================================
  // Validate Token (real API-based validation)
  // ==========================================

  async validateToken(
    channelId: string,
    token: string,
    appToken?: string,
  ): Promise<AuthSession> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const config = (typeof channel.config === "string" ? JSON.parse(channel.config) : channel.config) as Record<string, unknown>;
    const openclawType = config?.openclawType as OpenClawChannelType | undefined;

    if (!openclawType) {
      throw new BadRequestException(
        `Channel ${channelId} does not have an openclawType configured`,
      );
    }

    if (!this.authFactory.supportsTokenValidation(openclawType)) {
      throw new BadRequestException(
        `Channel type '${openclawType}' does not support token-based validation. ` +
          (this.authFactory.requiresQrPairing(openclawType)
            ? "Use QR pairing instead."
            : "Use startAuth flow instead."),
      );
    }

    this.logger.log(`Validating ${openclawType} token for channel ${channelId}`);

    const result = await this.authFactory.validateCredentials({
      channelType: openclawType,
      token,
      appToken,
    });

    // Update session
    const session =
      this.sessions.get(channelId) || this.createSession(channelId, openclawType);
    session.state = result.state;
    session.error = result.error;

    // Store platform-specific details
    if ("botInfo" in result && result.botInfo) {
      session.platformDetails = { botInfo: result.botInfo };
    }
    if ("guilds" in result && result.guilds) {
      session.platformDetails = {
        ...session.platformDetails,
        guilds: result.guilds,
      };
    }
    if ("socketModeValid" in result) {
      session.platformDetails = {
        ...session.platformDetails,
        socketModeValid: result.socketModeValid,
      };
    }

    this.sessions.set(channelId, session);

    // If validation succeeded, update channel status in DB
    if (result.state === "paired") {
      await prisma.communicationChannel.update({
        where: { id: channelId },
        data: {
          status: "ACTIVE",
          statusMessage: `${openclawType} channel validated successfully`,
        },
      });
    }

    return session;
  }

  // ==========================================
  // WhatsApp QR Refresh
  // ==========================================

  async refreshQr(channelId: string): Promise<AuthSession> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const config = (typeof channel.config === "string" ? JSON.parse(channel.config) : channel.config) as Record<string, unknown>;
    const openclawType = config?.openclawType as OpenClawChannelType | undefined;

    if (openclawType !== "whatsapp") {
      throw new BadRequestException(
        "QR refresh is only supported for WhatsApp channels",
      );
    }

    const whatsappService = this.authFactory.getWhatsAppService();
    const result = await whatsappService.refreshQr(channelId);

    const session =
      this.sessions.get(channelId) || this.createSession(channelId, "whatsapp");
    session.state = result.state;
    session.qrCode = result.qrCode;
    session.qrExpiresAt = result.qrExpiresAt;
    session.error = result.error;

    this.sessions.set(channelId, session);
    return session;
  }

  // ==========================================
  // Poll Auth Status
  // ==========================================

  async getAuthStatus(channelId: string): Promise<AuthSession> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const session = this.sessions.get(channelId);

    if (!session) {
      const config = (typeof channel.config === "string" ? JSON.parse(channel.config) : channel.config) as Record<string, unknown>;
      const openclawType =
        (config?.openclawType as OpenClawChannelType) || "whatsapp";

      return {
        id: "none",
        channelId,
        openclawType,
        state: "pending",
        startedAt: new Date(),
        expiresAt: new Date(),
      };
    }

    // Check for expiration
    if (
      session.state !== "paired" &&
      session.state !== "error" &&
      new Date() > session.expiresAt
    ) {
      session.state = "expired";
    }

    // For WhatsApp, also get real-time QR status
    if (session.openclawType === "whatsapp" && session.state === "pairing") {
      const whatsappService = this.authFactory.getWhatsAppService();
      const status = whatsappService.getSessionStatus(channelId);
      session.qrCode = status.qrCode;
      session.qrExpiresAt = status.qrExpiresAt;
      if (status.state === "paired") {
        session.state = "paired";
      }
    }

    return session;
  }

  // ==========================================
  // Complete Auth
  // ==========================================

  async completeAuth(channelId: string): Promise<AuthSession> {
    const session = this.sessions.get(channelId);

    if (!session) {
      throw new NotFoundException(
        `No auth session found for channel ${channelId}`,
      );
    }

    session.state = "paired";

    if (session.openclawType === "whatsapp") {
      this.authFactory.getWhatsAppService().completePairing(channelId);
    }

    await prisma.communicationChannel.update({
      where: { id: channelId },
      data: {
        status: "ACTIVE",
        statusMessage: `${session.openclawType} channel paired successfully`,
      },
    });

    return session;
  }

  // ==========================================
  // Fail Auth
  // ==========================================

  async failAuth(channelId: string, error: string): Promise<AuthSession> {
    const session = this.sessions.get(channelId);

    if (!session) {
      throw new NotFoundException(
        `No auth session found for channel ${channelId}`,
      );
    }

    session.state = "error";
    session.error = error;

    if (session.openclawType === "whatsapp") {
      this.authFactory.getWhatsAppService().failPairing(channelId, error);
    }

    await prisma.communicationChannel.update({
      where: { id: channelId },
      data: {
        status: "ERROR",
        statusMessage: error,
        lastError: error,
        errorCount: { increment: 1 },
      },
    });

    return session;
  }

  // ==========================================
  // Runtime Compatibility Check
  // ==========================================

  async validateRuntimeCompatibility(
    botInstanceId: string,
    openclawType: OpenClawChannelType,
  ): Promise<void> {
    if (!NODE_REQUIRED_CHANNELS.includes(openclawType)) {
      return;
    }

    const bot = await prisma.botInstance.findUnique({
      where: { id: botInstanceId },
      select: { id: true, name: true, metadata: true },
    });

    if (!bot) {
      throw new NotFoundException(`Bot instance ${botInstanceId} not found`);
    }

    const metadata = (typeof bot.metadata === "string" ? JSON.parse(bot.metadata) : bot.metadata) as Record<string, unknown> | null;
    const runtime = metadata?.runtime as string | undefined;

    if (runtime && runtime.toLowerCase() === "bun") {
      throw new BadRequestException(
        `Channel type '${openclawType}' requires Node.js runtime but bot '${bot.name}' ` +
          `is configured to use Bun. WhatsApp and Telegram channels are not supported on Bun.`,
      );
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private createSession(
    channelId: string,
    openclawType: OpenClawChannelType,
  ): AuthSession {
    const now = new Date();
    const isQrPairing = QR_PAIRING_CHANNELS.includes(openclawType);
    const timeoutMs = isQrPairing ? this.QR_TIMEOUT_MS : this.TOKEN_TIMEOUT_MS;

    return {
      id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      channelId,
      openclawType,
      state: "pending",
      startedAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
    };
  }
}
