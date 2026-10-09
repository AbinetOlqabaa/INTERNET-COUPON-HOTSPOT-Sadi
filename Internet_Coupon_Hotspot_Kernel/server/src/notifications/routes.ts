import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { NotificationService } from './service.js';
import type { AuthenticatedRequest } from '../auth/routes.js';

const CreateNotificationBodySchema = z.object({
  recipientType: z.enum(['customer', 'owner', 'portal']),
  recipientId: z.string().min(1),
  channel: z.enum(['in_app', 'portal_toast', 'webhook', 'sms_mock', 'email_mock']).default('in_app'),
  template: z.enum([
    'session_expiring',
    'payment_confirmed',
    'package_purchased',
    'voucher_redeemed',
    'quota_warning',
    'security_alert',
    'system',
  ]),
  title: z.string().min(1).max(128),
  message: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional(),
  maxAttempts: z.number().int().positive().optional(),
});

export function createNotificationRouter(
  notificationService: NotificationService,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();

  // Public Portal endpoints (no bearer token required for customer device / session toasts)
  router.get('/portal/:recipientId', async (req, res) => {
    try {
      const recipientId = req.params.recipientId;
      const notifications = await notificationService.listPortalNotifications(recipientId);
      res.json({ notifications });
    } catch (err: unknown) {
      res.status(500).json({
        error: { code: 'PORTAL_NOTIFICATIONS_FAILED', message: (err as Error).message },
      });
    }
  });

  router.patch('/portal/:id/read', async (req, res) => {
    try {
      const updated = await notificationService.markAsRead(req.params.id);
      res.json({ notification: updated });
    } catch (err: unknown) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: (err as Error).message },
      });
    }
  });

  // Protected Owner endpoints
  router.get('/', authMiddleware, async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context missing.' } });
        return;
      }
      const { status, recipientType, recipientId, unreadOnly, limit } = req.query;
      const notifications = await notificationService.listOwnerNotifications(ownerId, {
        status: typeof status === 'string' ? status : undefined,
        recipientType: typeof recipientType === 'string' ? recipientType : undefined,
        recipientId: typeof recipientId === 'string' ? recipientId : undefined,
        unreadOnly: unreadOnly === 'true',
        limit: limit ? Number(limit) : undefined,
      });
      const unreadCount = notifications.filter((n) => n.status !== 'read').length;
      res.json({ notifications, unreadCount, total: notifications.length });
    } catch (err: unknown) {
      res.status(500).json({
        error: { code: 'NOTIFICATIONS_FETCH_FAILED', message: (err as Error).message },
      });
    }
  });

  router.post('/', authMiddleware, async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context missing.' } });
        return;
      }
      const parsed = CreateNotificationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid notification data', details: parsed.error.issues },
        });
        return;
      }

      const created = await notificationService.createNotification(ownerId, parsed.data);
      res.status(201).json({ notification: created });
    } catch (err: unknown) {
      res.status(500).json({
        error: { code: 'NOTIFICATION_CREATE_FAILED', message: (err as Error).message },
      });
    }
  });

  router.patch('/:id/read', authMiddleware, async (req, res) => {
    try {
      const updated = await notificationService.markAsRead(req.params.id);
      res.json({ notification: updated });
    } catch (err: unknown) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: (err as Error).message },
      });
    }
  });

  router.post('/:id/retry', authMiddleware, async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context missing.' } });
        return;
      }
      const retried = await notificationService.retryNotification(ownerId, req.params.id);
      res.json({ notification: retried });
    } catch (err: unknown) {
      res.status(400).json({
        error: { code: 'RETRY_FAILED', message: (err as Error).message },
      });
    }
  });

  router.post('/check-expiring', authMiddleware, async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context missing.' } });
        return;
      }
      const alerts = await notificationService.checkExpiringSessions(ownerId);
      res.json({ generatedAlertsCount: alerts.length, alerts });
    } catch (err: unknown) {
      res.status(500).json({
        error: { code: 'EXPIRY_CHECK_FAILED', message: (err as Error).message },
      });
    }
  });

  return router;
}
