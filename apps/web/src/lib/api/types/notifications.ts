/**
 * Notification channel types.
 */

export type NotificationChannelType = 'SLACK_WEBHOOK' | 'WEBHOOK' | 'EMAIL';

export interface AlertNotificationRule {
  id: string;
  channelId: string;
  severities?: string | null;
  alertRules?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationChannel {
  id: string;
  workspaceId: string;
  name: string;
  type: NotificationChannelType;
  config: string;
  enabled: boolean;
  lastTestedAt?: string | null;
  lastDeliveryAt?: string | null;
  lastError?: string | null;
  deliveryCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  notificationRules: AlertNotificationRule[];
}

export interface CreateNotificationChannelPayload {
  name: string;
  type: NotificationChannelType;
  config: string;
  enabled?: boolean;
}

export interface UpdateNotificationChannelPayload {
  name?: string;
  type?: NotificationChannelType;
  config?: string;
  enabled?: boolean;
}

export interface CreateNotificationRulePayload {
  channelId: string;
  severities?: string;
  alertRules?: string;
  enabled?: boolean;
}

export interface UpdateNotificationRulePayload {
  severities?: string;
  alertRules?: string;
  enabled?: boolean;
}

export interface NotificationChannelFilters {
  type?: string;
  enabled?: boolean;
}
