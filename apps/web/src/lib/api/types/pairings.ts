/**
 * Device pairing types.
 */

export type PairingState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';

export interface DevicePairing {
  id: string;
  instanceId: string;
  channelType: string;
  senderId: string;
  senderName?: string;
  platform?: string;
  state: PairingState;
  approvedAt?: string;
  revokedAt?: string;
  lastSeenAt?: string;
  ipAddress?: string;
  deviceInfo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovePairingPayload {
  channelType: string;
  senderId: string;
}

export interface RejectPairingPayload {
  channelType: string;
  senderId: string;
}

export interface RevokePairingPayload {
  channelType: string;
  senderId: string;
}

export interface ApproveAllResult {
  count: number;
}
