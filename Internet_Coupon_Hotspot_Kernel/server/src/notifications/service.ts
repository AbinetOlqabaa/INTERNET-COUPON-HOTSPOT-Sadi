import type { RepositoryRegistry } from '../db/repositories.js';
import type { NotificationEntity } from '../db/schema.js';

export class NotificationService {
  constructor(private db: RepositoryRegistry) {}

  async createNotification(
    ownerId: string,
    data: {
      recipientType: 'customer' | 'owner' | 'portal';
      recipientId: string;
      channel: 'in_app' | 'portal_toast' | 'webhook' | 'sms_mock' | 'email_mock';
      template:
        | 'session_expiring'
        | 'payment_confirmed'
        | 'package_purchased'
        | 'voucher_redeemed'
        | 'quota_warning'
        | 'security_alert'
        | 'system';
      title: string;
      message: string;
      metadata?: Record<string, unknown>;
      maxAttempts?: number;
    }
  ): Promise<NotificationEntity> {
    const notification = await this.db.notifications.create({
      ownerId,
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      channel: data.channel,
      template: data.template,
      title: data.title,
      message: data.message,
      metadata: data.metadata ?? {},
      maxAttempts: data.maxAttempts ?? 3,
      status: 'pending',
      deliveryAttempts: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      readAt: null,
    });

    // Execute initial delivery attempt
    return await this.dispatchDelivery(notification);
  }

  async dispatchDelivery(notification: NotificationEntity): Promise<NotificationEntity> {
    const { id, channel } = notification;

    if (channel === 'in_app' || channel === 'portal_toast' || channel === 'sms_mock' || channel === 'email_mock') {
      const delivered = await this.db.notifications.markDelivered(id);
      return delivered ?? notification;
    }

    if (channel === 'webhook') {
      // If metadata contains failSimulation: true, simulate failure
      if (notification.metadata?.simulateFailure === true) {
        const failed = await this.db.notifications.markFailed(id);
        return failed ?? notification;
      }
      const delivered = await this.db.notifications.markDelivered(id);
      return delivered ?? notification;
    }

    const delivered = await this.db.notifications.markDelivered(id);
    return delivered ?? notification;
  }

  async retryNotification(ownerId: string, id: string): Promise<NotificationEntity> {
    const existing = await this.db.notifications.findById(id);
    if (!existing || existing.ownerId !== ownerId) {
      throw new Error('Notification not found');
    }

    if (existing.deliveryAttempts >= existing.maxAttempts) {
      throw new Error(`Max retry attempts (${existing.maxAttempts}) reached for notification.`);
    }

    // If metadata simulateFailure is cleared or false, now succeed
    if (existing.metadata?.simulateFailure) {
      const updatedMeta = { ...existing.metadata, simulateFailure: false };
      await this.db.notifications.update(id, { metadata: updatedMeta });
    }

    const delivered = await this.db.notifications.markDelivered(id);
    return delivered ?? existing;
  }

  async markAsRead(id: string): Promise<NotificationEntity> {
    const res = await this.db.notifications.markRead(id);
    if (!res) throw new Error('Notification not found');
    return res;
  }

  async listOwnerNotifications(
    ownerId: string,
    options?: { status?: string; recipientType?: string; recipientId?: string; unreadOnly?: boolean; limit?: number }
  ): Promise<NotificationEntity[]> {
    return this.db.notifications.list(ownerId, options);
  }

  async listPortalNotifications(recipientId: string, limit = 20): Promise<NotificationEntity[]> {
    return this.db.notifications.listByRecipient(recipientId, limit);
  }

  async checkExpiringSessions(ownerId: string): Promise<NotificationEntity[]> {
    const activeSessions = await this.db.sessions.list(ownerId, 'active');
    const alerts: NotificationEntity[] = [];

    for (const s of activeSessions) {
      if (s.remainingSeconds <= 300 && s.remainingSeconds > 0) {
        // Check if an alert was already generated for this session
        const existing = await this.db.notifications.list(ownerId, {
          recipientId: s.id,
          recipientType: 'portal',
        });
        const hasExpiryAlert = existing.some((n) => n.template === 'session_expiring');
        if (!hasExpiryAlert) {
          const alert = await this.createNotification(ownerId, {
            recipientType: 'portal',
            recipientId: s.id,
            channel: 'portal_toast',
            template: 'session_expiring',
            title: 'Session Expiring Soon',
            message: `Your internet access expires in ${Math.ceil(s.remainingSeconds / 60)} minute(s). Redeem a voucher to extend!`,
            metadata: { sessionId: s.id, remainingSeconds: s.remainingSeconds },
          });
          alerts.push(alert);
        }
      }
    }
    return alerts;
  }
}
