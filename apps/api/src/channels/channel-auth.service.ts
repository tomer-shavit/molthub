import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@molthub/database";
import {
  MoltbotChannelType,
  ChannelAuthState,
  CHANNEL_TYPE_META,
  NODE_REQUIRED_CHANNELS,
  QR_PAIRING_CHANNELS,
} from "./channel-types";

// ============================================
// Auth Session (in-memory until ChannelAuthSession model lands via WP-06)
// ============================================

export interface AuthSession {
  id: string;
  channelId: string;
  moltbotType: MoltbotChannelType;
  state: ChannelAuthState;
  qrCode?: string;
  pairingUrl?: string;
  error?: string;
  startedAt: Date;
  expiresAt: Date;
  botInstanceId?: string;
}

@Injectable()
export class ChannelAuthService {
  /** In-memory auth session store. Keyed by channelId. */
  private sessions = new Map<string, AuthSession>();

  /** QR pairing session timeout in ms (5 minutes) */
  private readonly QR_TIMEOUT_MS = 5 * 60 * 1000;

  /** Token auth session timeout in ms (15 minutes) */
  private readonly TOKEN_TIMEOUT_MS = 15 * 60 * 1000;

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

    const config = channel.config as Record<string, unknown>;
    const moltbotType = config?.moltbotType as MoltbotChannelType | undefined;

    if (!moltbotType) {
      throw new BadRequestException(
        `Channel ${channelId} does not have a moltbotType configured`,
      );
    }

    // Runtime compatibility check for Node-required channels
    if (botInstanceId && NODE_REQUIRED_CHANNELS.includes(moltbotType)) {
      await this.validateRuntimeCompatibility(botInstanceId, moltbotType);
    }

    // Check if there is already an active (non-expired, non-error) session
    const existing = this.sessions.get(channelId);
    if (existing && existing.state !== 'expired' && existing.state !== 'error') {
      // Expire the old session before starting a new one
      existing.state = 'expired';
    }

    const meta = CHANNEL_TYPE_META[moltbotType];
    const now = new Date();
    const isQrPairing = QR_PAIRING_CHANNELS.includes(moltbotType);
    const timeoutMs = isQrPairing ? this.QR_TIMEOUT_MS : this.TOKEN_TIMEOUT_MS;

    const session: AuthSession = {
      id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      channelId,
      moltbotType,
      state: this.determineInitialState(moltbotType),
      startedAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
      botInstanceId,
    };

    // Simulate channel-specific auth initialization
    if (isQrPairing) {
      session.state = 'pairing';
      session.qrCode = this.generateMockQrPayload(channelId, moltbotType);
      session.pairingUrl = `moltbot://pair/${moltbotType}/${channelId}`;
    } else if (meta.authMethod === 'token') {
      // For token-based channels, check if required secrets are already present
      const secrets = (config?.secrets as Record<string, string>) || undefined;
      const hasAllSecrets = meta.requiredSecrets.every(
        (s) => secrets?.[s] && secrets[s].length > 0,
      );
      if (hasAllSecrets) {
        session.state = 'paired';
      } else {
        session.state = 'pending';
      }
    } else {
      session.state = 'pending';
    }

    this.sessions.set(channelId, session);

    // Schedule expiration
    setTimeout(() => {
      const s = this.sessions.get(channelId);
      if (s && s.id === session.id && s.state !== 'paired') {
        s.state = 'expired';
      }
    }, timeoutMs);

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
      // No active session - return a default pending state
      const config = channel.config as Record<string, unknown>;
      const moltbotType = (config?.moltbotType as MoltbotChannelType) || 'whatsapp';

      return {
        id: 'none',
        channelId,
        moltbotType,
        state: 'pending',
        startedAt: new Date(),
        expiresAt: new Date(),
      };
    }

    // Check for expiration
    if (session.state !== 'paired' && session.state !== 'error' && new Date() > session.expiresAt) {
      session.state = 'expired';
    }

    return session;
  }

  // ==========================================
  // Complete Auth (called when credentials are confirmed)
  // ==========================================

  async completeAuth(channelId: string): Promise<AuthSession> {
    const session = this.sessions.get(channelId);

    if (!session) {
      throw new NotFoundException(`No auth session found for channel ${channelId}`);
    }

    session.state = 'paired';

    // Update channel status in DB
    await prisma.communicationChannel.update({
      where: { id: channelId },
      data: {
        status: 'ACTIVE',
        statusMessage: `${session.moltbotType} channel paired successfully`,
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
      throw new NotFoundException(`No auth session found for channel ${channelId}`);
    }

    session.state = 'error';
    session.error = error;

    // Update channel status in DB
    await prisma.communicationChannel.update({
      where: { id: channelId },
      data: {
        status: 'ERROR',
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
    moltbotType: MoltbotChannelType,
  ): Promise<void> {
    if (!NODE_REQUIRED_CHANNELS.includes(moltbotType)) {
      return; // No restriction
    }

    const bot = await prisma.botInstance.findUnique({
      where: { id: botInstanceId },
      select: { id: true, name: true, metadata: true },
    });

    if (!bot) {
      throw new NotFoundException(`Bot instance ${botInstanceId} not found`);
    }

    // Check metadata for runtime info (desiredManifest or metadata may contain runtime)
    const metadata = bot.metadata as Record<string, unknown> | null;
    const runtime = metadata?.runtime as string | undefined;

    if (runtime && runtime.toLowerCase() === 'bun') {
      throw new BadRequestException(
        `Channel type '${moltbotType}' requires Node.js runtime but bot '${bot.name}' ` +
        `is configured to use Bun. WhatsApp and Telegram channels are not supported on Bun.`,
      );
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private determineInitialState(type: MoltbotChannelType): ChannelAuthState {
    if (QR_PAIRING_CHANNELS.includes(type)) {
      return 'pairing';
    }
    return 'pending';
  }

  private generateMockQrPayload(channelId: string, type: MoltbotChannelType): string {
    // In production, this would call `moltbot channels login` and capture QR output
    // For now, return a placeholder QR data string
    return `moltbot-qr://${type}/${channelId}/${Date.now()}`;
  }
}
