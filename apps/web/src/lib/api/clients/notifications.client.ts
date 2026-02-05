/**
 * Notifications domain client.
 * Handles notification channels and rules.
 */

import { BaseHttpClient } from '../base-client';
import type {
  NotificationChannel,
  CreateNotificationChannelPayload,
  UpdateNotificationChannelPayload,
  AlertNotificationRule,
  CreateNotificationRulePayload,
  UpdateNotificationRulePayload,
  NotificationChannelFilters,
} from '../types/notifications';

export class NotificationsClient extends BaseHttpClient {
  /**
   * List notification channels with optional filters.
   */
  listChannels(filters?: NotificationChannelFilters): Promise<NotificationChannel[]> {
    return this.get('/notification-channels', filters);
  }

  /**
   * Get a single notification channel by ID.
   */
  getChannel(id: string): Promise<NotificationChannel> {
    return this.get(`/notification-channels/${id}`);
  }

  /**
   * Create a new notification channel.
   */
  createChannel(data: CreateNotificationChannelPayload): Promise<NotificationChannel> {
    return this.post('/notification-channels', data);
  }

  /**
   * Update a notification channel.
   */
  updateChannel(id: string, data: UpdateNotificationChannelPayload): Promise<NotificationChannel> {
    return this.patch(`/notification-channels/${id}`, data);
  }

  /**
   * Delete a notification channel.
   */
  deleteChannel(id: string): Promise<void> {
    return this.delete(`/notification-channels/${id}`);
  }

  /**
   * Test a notification channel.
   */
  testChannel(id: string): Promise<NotificationChannel> {
    return this.post(`/notification-channels/${id}/test`);
  }

  /**
   * Create a notification rule for a channel.
   */
  createRule(channelId: string, data: CreateNotificationRulePayload): Promise<AlertNotificationRule> {
    return this.post(`/notification-channels/${channelId}/rules`, data);
  }

  /**
   * Update a notification rule.
   */
  updateRule(ruleId: string, data: UpdateNotificationRulePayload): Promise<AlertNotificationRule> {
    return this.patch(`/notification-channels/rules/${ruleId}`, data);
  }

  /**
   * Delete a notification rule.
   */
  deleteRule(ruleId: string): Promise<void> {
    return this.delete(`/notification-channels/rules/${ruleId}`);
  }
}

export const notificationsClient = new NotificationsClient();
