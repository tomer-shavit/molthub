import { Injectable, Logger } from "@nestjs/common";
import { ChannelAuthState } from "../channel-types";

// ---------------------------------------------------------------------------
// WhatsApp Auth Service
//
// WhatsApp uses QR-based pairing via `moltbot channels login`.
// In production, this would execute the command on the Moltbot instance
// via the Gateway or deployment target and stream the QR code back.
// The QR code refreshes every ~20 seconds.
// ---------------------------------------------------------------------------

export interface WhatsAppAuthResult {
  state: ChannelAuthState;
  qrCode?: string;
  qrExpiresAt?: Date;
  error?: string;
}

export interface WhatsAppPairingSession {
  channelId: string;
  botInstanceId?: string;
  state: ChannelAuthState;
  qrCode?: string;
  qrGeneratedAt?: Date;
  qrExpiresAt?: Date;
  refreshCount: number;
  error?: string;
}

/** How long a single QR code is valid before auto-refreshing (20s per WhatsApp) */
const QR_REFRESH_INTERVAL_MS = 20_000;

/** Maximum number of QR refreshes before the entire session expires */
const MAX_QR_REFRESHES = 15;

/** Overall session timeout (5 minutes) */
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class WhatsAppAuthService {
  private readonly logger = new Logger(WhatsAppAuthService.name);

  /** Active pairing sessions, keyed by channelId */
  private sessions = new Map<string, WhatsAppPairingSession>();

  /** Refresh timers keyed by channelId */
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Session expiry timers keyed by channelId */
  private sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ========================================================================
  // Start Pairing
  // ========================================================================

  async startPairing(
    channelId: string,
    botInstanceId?: string,
  ): Promise<WhatsAppAuthResult> {
    this.logger.log(`Starting WhatsApp QR pairing for channel ${channelId}`);

    // Cancel any existing session for this channel
    this.cancelSession(channelId);

    const qrCode = await this.generateQrCode(channelId, botInstanceId);
    const now = new Date();

    const session: WhatsAppPairingSession = {
      channelId,
      botInstanceId,
      state: "pairing",
      qrCode,
      qrGeneratedAt: now,
      qrExpiresAt: new Date(now.getTime() + QR_REFRESH_INTERVAL_MS),
      refreshCount: 0,
    };

    this.sessions.set(channelId, session);

    // Schedule auto-refresh of QR code
    this.scheduleQrRefresh(channelId);

    // Schedule overall session timeout
    this.scheduleSessionTimeout(channelId);

    return {
      state: session.state,
      qrCode: session.qrCode,
      qrExpiresAt: session.qrExpiresAt,
    };
  }

  // ========================================================================
  // Refresh QR Code
  // ========================================================================

  async refreshQr(channelId: string): Promise<WhatsAppAuthResult> {
    const session = this.sessions.get(channelId);

    if (!session) {
      return { state: "expired", error: "No active pairing session" };
    }

    if (session.state === "paired") {
      return { state: "paired" };
    }

    if (session.refreshCount >= MAX_QR_REFRESHES) {
      session.state = "expired";
      session.error = "Maximum QR refresh attempts exceeded";
      this.cancelTimers(channelId);
      return { state: "expired", error: session.error };
    }

    const qrCode = await this.generateQrCode(channelId, session.botInstanceId);
    const now = new Date();

    session.qrCode = qrCode;
    session.qrGeneratedAt = now;
    session.qrExpiresAt = new Date(now.getTime() + QR_REFRESH_INTERVAL_MS);
    session.refreshCount++;

    this.logger.debug(
      `WhatsApp QR refreshed for channel ${channelId} (refresh #${session.refreshCount})`,
    );

    return {
      state: session.state,
      qrCode: session.qrCode,
      qrExpiresAt: session.qrExpiresAt,
    };
  }

  // ========================================================================
  // Get Session Status
  // ========================================================================

  getSessionStatus(channelId: string): WhatsAppAuthResult {
    const session = this.sessions.get(channelId);

    if (!session) {
      return { state: "pending" };
    }

    // Check if QR has expired and needs refresh
    if (
      session.state === "pairing" &&
      session.qrExpiresAt &&
      new Date() > session.qrExpiresAt
    ) {
      // QR expired but session still active — client should call refreshQr
      return {
        state: session.state,
        qrCode: undefined,
        qrExpiresAt: session.qrExpiresAt,
      };
    }

    return {
      state: session.state,
      qrCode: session.qrCode,
      qrExpiresAt: session.qrExpiresAt,
      error: session.error,
    };
  }

  // ========================================================================
  // Complete / Fail Pairing
  // ========================================================================

  completePairing(channelId: string): WhatsAppAuthResult {
    const session = this.sessions.get(channelId);
    if (!session) {
      return { state: "error", error: "No active pairing session" };
    }

    session.state = "paired";
    session.qrCode = undefined;
    this.cancelTimers(channelId);

    this.logger.log(`WhatsApp pairing completed for channel ${channelId}`);
    return { state: "paired" };
  }

  failPairing(channelId: string, error: string): WhatsAppAuthResult {
    const session = this.sessions.get(channelId);
    if (!session) {
      return { state: "error", error };
    }

    session.state = "error";
    session.error = error;
    this.cancelTimers(channelId);

    this.logger.error(`WhatsApp pairing failed for channel ${channelId}: ${error}`);
    return { state: "error", error };
  }

  // ========================================================================
  // Private: QR Code Generation
  // ========================================================================

  /**
   * Generate a QR code payload for WhatsApp pairing.
   *
   * In production, this would:
   * 1. Connect to the Moltbot instance via Gateway or deployment target
   * 2. Execute `moltbot channels login` on the instance
   * 3. Capture the QR code data from stdout
   * 4. Return the base64-encoded QR image data
   *
   * For now, we generate a deterministic pairing URL that a real Gateway
   * integration would replace.
   */
  private async generateQrCode(
    channelId: string,
    _botInstanceId?: string,
  ): Promise<string> {
    // TODO: Replace with real Gateway integration:
    //   const client = gatewayManager.getClient(botInstanceId);
    //   const result = await client.agent({ prompt: 'moltbot channels login' });
    //   return result.completion.qrData;

    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 10);
    return `moltbot-wa-qr://${channelId}/${timestamp}/${nonce}`;
  }

  // ========================================================================
  // Private: Timers
  // ========================================================================

  private scheduleQrRefresh(channelId: string): void {
    this.clearRefreshTimer(channelId);

    const timer = setTimeout(async () => {
      const session = this.sessions.get(channelId);
      if (session && session.state === "pairing") {
        await this.refreshQr(channelId);
        // Re-schedule if still active
        if (session.state === "pairing") {
          this.scheduleQrRefresh(channelId);
        }
      }
    }, QR_REFRESH_INTERVAL_MS);

    this.refreshTimers.set(channelId, timer);
  }

  private scheduleSessionTimeout(channelId: string): void {
    this.clearSessionTimer(channelId);

    const timer = setTimeout(() => {
      const session = this.sessions.get(channelId);
      if (session && session.state !== "paired") {
        session.state = "expired";
        session.error = "Pairing session timed out";
        this.cancelTimers(channelId);
        this.logger.warn(`WhatsApp pairing session expired for channel ${channelId}`);
      }
    }, SESSION_TIMEOUT_MS);

    this.sessionTimers.set(channelId, timer);
  }

  private cancelTimers(channelId: string): void {
    this.clearRefreshTimer(channelId);
    this.clearSessionTimer(channelId);
  }

  private clearRefreshTimer(channelId: string): void {
    const t = this.refreshTimers.get(channelId);
    if (t) {
      clearTimeout(t);
      this.refreshTimers.delete(channelId);
    }
  }

  private clearSessionTimer(channelId: string): void {
    const t = this.sessionTimers.get(channelId);
    if (t) {
      clearTimeout(t);
      this.sessionTimers.delete(channelId);
    }
  }

  private cancelSession(channelId: string): void {
    this.cancelTimers(channelId);
    this.sessions.delete(channelId);
  }
}
