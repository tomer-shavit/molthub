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
    REMOTE_VM: 'VM',
    ECS_EC2: 'ECS',
    CLOUD_RUN: 'Cloud Run',
    ACI: 'ACI',
    KUBERNETES: 'K8s',
  };
  return labels[type.toUpperCase()] || type;
}
