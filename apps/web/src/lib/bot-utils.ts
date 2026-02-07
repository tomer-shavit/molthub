import type { BotInstance } from './api';

export function getBotDescription(bot: BotInstance): string | null {
  try {
    const manifest =
      typeof bot.desiredManifest === 'string'
        ? JSON.parse(bot.desiredManifest)
        : bot.desiredManifest;
    return manifest?.spec?.description || manifest?.description || null;
  } catch {
    return null;
  }
}

export function formatUptime(runningSince: string | undefined | null): string {
  if (!runningSince) return '-';
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(runningSince).getTime()) / 1000),
  );
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatDeploymentType(
  type: string | undefined | null,
): string {
  if (!type) return '-';
  const labels: Record<string, string> = {
    LOCAL: 'Local',
    DOCKER: 'Docker',
    ECS_EC2: 'ECS',
    GCE: 'GCE',
    AZURE_VM: 'Azure VM',
  };
  return labels[type.toUpperCase()] || type;
}

/**
 * Resolves the gateway endpoint (host + port) for a bot,
 * preferring the persisted GatewayConnection (ALB endpoint for cloud bots)
 * over the raw internal gatewayPort.
 */
export function resolveGatewayEndpoint(bot: Pick<BotInstance, 'gatewayConnection' | 'gatewayPort' | 'metadata'>): {
  host: string;
  port: number;
} {
  return {
    host: bot.gatewayConnection?.host || (bot.metadata?.gatewayHost as string) || 'localhost',
    port: bot.gatewayConnection?.port || bot.gatewayPort || 18789,
  };
}

/** Builds a full HTTP(S) URL for a gateway endpoint. */
export function buildGatewayUrl(endpoint: { host: string; port: number }): string {
  if (endpoint.port === 443) return `https://${endpoint.host}`;
  if (endpoint.port === 80) return `http://${endpoint.host}`;
  return `http://${endpoint.host}:${endpoint.port}`;
}
