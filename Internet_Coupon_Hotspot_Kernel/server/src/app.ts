import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { defaultDb } from './db/repositories.js';
import { AuthService } from './auth/service.js';
import { createAuthRouter, createAuthMiddleware } from './auth/routes.js';
import { createOwnerRouter } from './owner/routes.js';
import { createCustomerRouter } from './customers/routes.js';
import { createPackageRouter } from './packages/routes.js';
import { createCouponRouter } from './coupons/routes.js';
import { createAdminRouter } from './admin/routes.js';
import { PaymentService } from './payments/service.js';
import { createPaymentRouter } from './payments/routes.js';
import { GatewayService } from './gateway/service.js';
import { createGatewayRouter } from './gateway/routes.js';
import { SessionService } from './sessions/service.js';
import { createSessionRouter } from './sessions/routes.js';
import { NotificationService } from './notifications/service.js';
import { createNotificationRouter } from './notifications/routes.js';
import { AnalyticsService } from './analytics/service.js';
import { createAnalyticsRouter } from './analytics/routes.js';
import { LoyaltyService } from './loyalty/service.js';
import { createLoyaltyRouter } from './loyalty/routes.js';
import { AIService } from './ai/service.js';
import { createAIRouter } from './ai/routes.js';

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .parse({
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  });

export const app = express();
export const authService = new AuthService(defaultDb);
export const paymentService = new PaymentService(defaultDb);
export const gatewayService = new GatewayService(defaultDb);
export const sessionService = new SessionService(defaultDb, gatewayService);
export const notificationService = new NotificationService(defaultDb);
export const analyticsService = new AnalyticsService(defaultDb);
export const loyaltyService = new LoyaltyService(defaultDb);
export const aiService = new AIService(defaultDb);
export const authMiddleware = createAuthMiddleware(authService, defaultDb);

// Guarantee permanent administrator is seeded on server start
authService.ensureDefaultAdmin().catch((err) => {
  if (process.env.NODE_ENV !== 'test') console.warn('Permanent admin initialization note:', err);
});

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((x) => x.trim()) }));
app.use(express.json({ limit: '256kb' }));

// Health Check Endpoint
app.get('/api/v1/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'internet-coupon-hotspot-api',
    version: 'v1',
    mode: 'fullstack-monolith',
    capabilities: {
      persistentStorage: true,
      authentication: true,
      rbacEnabled: true,
      adminConsole: true,
      ownerDashboard: true,
      packageCatalog: true,
      couponEngine: true,
      sessionEngine: true,
      sessionStateClocks: true,
      paymentVerification: false,
      paymentAdapters: ['sandbox', 'manual_cash', 'signed_webhooks'],
      gatewayAdapters: ['limited_owner', 'mock_test_gateway'],
      generalLedger: true,
      ledgerReconciliation: true,
      notifications: true,
      analyticsReporting: true,
      customerLoyalty: true,
      aiCopilotRegistry: true,
      hotspotEnforcement: false,
      perClientTrafficAccounting: false,
    },
  })
);

// API Root Status
app.get('/api/v1', (_req, res) =>
  res.json({
    name: 'Internet Coupon Hotspot API',
    version: 'v1',
    status: 'active',
    modules: [
      'health',
      'auth',
      'database',
      'contracts',
      'owner',
      'customers',
      'packages',
      'coupons',
      'sessions',
      'gateways',
      'payments',
      'ledger',
      'admin',
      'notifications',
      'analytics',
      'loyalty',
      'ai',
    ],
  })
);

// Mount Subsystems
app.use('/api/v1/auth', createAuthRouter(authService, defaultDb));
app.use('/api/v1/owner', authMiddleware, createOwnerRouter(defaultDb));
app.use('/api/v1/customers', authMiddleware, createCustomerRouter(defaultDb));
app.use('/api/v1/packages', authMiddleware, createPackageRouter(defaultDb));
app.use('/api/v1/coupons', createCouponRouter(defaultDb, authMiddleware));
app.use('/api/v1/sessions', createSessionRouter(defaultDb, sessionService, authMiddleware));
app.use('/api/v1/gateways', createGatewayRouter(defaultDb, gatewayService, authMiddleware));
app.use('/api/v1/payments', createPaymentRouter(defaultDb, paymentService, authMiddleware));
app.use('/api/v1/admin', createAdminRouter(defaultDb, authService, authMiddleware));
app.use('/api/v1/notifications', createNotificationRouter(notificationService, authMiddleware));
app.use('/api/v1/analytics', createAnalyticsRouter(analyticsService, authMiddleware));
app.use('/api/v1/loyalty', createLoyaltyRouter(loyaltyService, authMiddleware));
app.use('/api/v1/ai', createAIRouter(aiService, authMiddleware));

// 404 Fallback
app.use((_req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested API route was not found.' } })
);

// Global Error Handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (env.NODE_ENV !== 'production') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
});
