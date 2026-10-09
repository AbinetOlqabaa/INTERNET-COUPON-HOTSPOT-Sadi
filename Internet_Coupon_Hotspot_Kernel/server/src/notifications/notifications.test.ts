import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryDatabase } from '../db/repositories.js';
import { NotificationService } from './service.js';
import { createNotificationRouter } from './routes.js';

describe('Phase 12: Notifications System', () => {
  let db: MemoryDatabase;
  let service: NotificationService;
  let app: express.Express;
  const ownerId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db = new MemoryDatabase();
    service = new NotificationService(db);
    app = express();
    app.use(express.json());

    const mockAuth = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as any).user = {
        id: ownerId,
        email: 'owner@example.com',
        businessName: 'Hotspot Cafe',
        role: 'OWNER',
        defaultCurrency: 'USD',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      (req as any).ownerId = ownerId;
      next();
    };

    app.use('/api/v1/notifications', createNotificationRouter(service, mockAuth));
  });

  it('creates an in-app notification and delivers it immediately', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({
        recipientType: 'owner',
        recipientId: ownerId,
        channel: 'in_app',
        template: 'system',
        title: 'System Startup',
        message: 'Hotspot Kernel initialized successfully.',
      });

    expect(res.status).toBe(201);
    expect(res.body.notification.status).toBe('delivered');
    expect(res.body.notification.deliveredAt).toBeTruthy();
    expect(res.body.notification.deliveryAttempts).toBe(1);
  });

  it('creates a portal toast notification and allows public query by recipientId', async () => {
    const sessionId = '22222222-2222-2222-2222-222222222222';
    await request(app)
      .post('/api/v1/notifications')
      .send({
        recipientType: 'portal',
        recipientId: sessionId,
        channel: 'portal_toast',
        template: 'session_expiring',
        title: 'Time Warning',
        message: 'Your access expires in 4 minutes.',
      });

    // Query public portal endpoint
    const portalRes = await request(app).get(`/api/v1/notifications/portal/${sessionId}`);
    expect(portalRes.status).toBe(200);
    expect(portalRes.body.notifications).toHaveLength(1);
    expect(portalRes.body.notifications[0].title).toBe('Time Warning');
    expect(portalRes.body.notifications[0].status).toBe('delivered');

    // Portal user marks toast as read
    const readRes = await request(app).patch(`/api/v1/notifications/portal/${portalRes.body.notifications[0].id}/read`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.notification.status).toBe('read');
    expect(readRes.body.notification.readAt).toBeTruthy();
  });

  it('handles delivery failure simulation and supports retry', async () => {
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .send({
        recipientType: 'customer',
        recipientId: 'cust-123',
        channel: 'webhook',
        template: 'payment_confirmed',
        title: 'Payment Received',
        message: 'Receipt sent via webhook.',
        metadata: { simulateFailure: true },
        maxAttempts: 3,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.notification.status).toBe('failed');
    expect(createRes.body.notification.deliveryAttempts).toBe(1);

    const notifId = createRes.body.notification.id;

    // Retry delivery
    const retryRes = await request(app).post(`/api/v1/notifications/${notifId}/retry`);
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.notification.status).toBe('delivered');
    expect(retryRes.body.notification.deliveryAttempts).toBe(2);
  });

  it('detects expiring active sessions and creates warning notifications', async () => {
    // Add active package and session with 180 seconds remaining
    const pkg = await db.packages.create({
      ownerId,
      name: '1 Hour',
      durationSeconds: 3600,
      priceMinor: 500,
      currency: 'USD',
      active: true,
    });

    const session = await db.sessions.create({
      ownerId,
      packageId: pkg.id,
      durationSeconds: 3600,
      remainingSeconds: 180,
      status: 'active',
      activatedAt: new Date(Date.now() - 3420000).toISOString(),
      expiresAt: new Date(Date.now() + 180000).toISOString(),
    });

    const checkRes = await request(app).post('/api/v1/notifications/check-expiring');
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.generatedAlertsCount).toBe(1);
    expect(checkRes.body.alerts[0].recipientId).toBe(session.id);
    expect(checkRes.body.alerts[0].template).toBe('session_expiring');

    // Running check again should not generate duplicate alert
    const checkAgainRes = await request(app).post('/api/v1/notifications/check-expiring');
    expect(checkAgainRes.status).toBe(200);
    expect(checkAgainRes.body.generatedAlertsCount).toBe(0);
  });
});
