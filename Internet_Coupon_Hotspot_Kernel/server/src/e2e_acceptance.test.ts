import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryDatabase } from './db/repositories.js';
import { AuthService } from './auth/service.js';
import { createAuthRouter, createAuthMiddleware } from './auth/routes.js';
import { createOwnerRouter } from './owner/routes.js';
import { createCustomerRouter } from './customers/routes.js';
import { createPackageRouter } from './packages/routes.js';
import { createCouponRouter } from './coupons/routes.js';
import { SessionService } from './sessions/service.js';
import { createSessionRouter } from './sessions/routes.js';
import { GatewayService } from './gateway/service.js';
import { PaymentService } from './payments/service.js';
import { createPaymentRouter } from './payments/routes.js';
import { createAdminRouter } from './admin/routes.js';
import { AnalyticsService } from './analytics/service.js';
import { createAnalyticsRouter } from './analytics/routes.js';
import { LoyaltyService } from './loyalty/service.js';
import { createLoyaltyRouter } from './loyalty/routes.js';

describe('Phase 19: Full End-to-End Acceptance Journey', () => {
  let db: MemoryDatabase;
  let authService: AuthService;
  let gatewayService: GatewayService;
  let sessionService: SessionService;
  let paymentService: PaymentService;
  let analyticsService: AnalyticsService;
  let loyaltyService: LoyaltyService;
  let app: express.Express;

  beforeEach(() => {
    db = new MemoryDatabase();
    db.seedPermanentAdmin();
    authService = new AuthService(db);
    gatewayService = new GatewayService(db);
    sessionService = new SessionService(db, gatewayService);
    paymentService = new PaymentService(db);
    analyticsService = new AnalyticsService(db);
    loyaltyService = new LoyaltyService(db);

    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(authService, db);

    app.use('/api/v1/auth', createAuthRouter(authService, db));
    app.use('/api/v1/admin', createAdminRouter(db, authService, authMiddleware));
    app.use('/api/v1/owner', authMiddleware, createOwnerRouter(db));
    app.use('/api/v1/customers', authMiddleware, createCustomerRouter(db));
    app.use('/api/v1/packages', authMiddleware, createPackageRouter(db));
    app.use('/api/v1/coupons', createCouponRouter(db, authMiddleware));
    app.use('/api/v1/sessions', createSessionRouter(db, sessionService, authMiddleware));
    app.use('/api/v1/payments', createPaymentRouter(db, paymentService, authMiddleware));
    app.use('/api/v1/analytics', createAnalyticsRouter(analyticsService, authMiddleware));
    app.use('/api/v1/loyalty', createLoyaltyRouter(loyaltyService, authMiddleware));
  });

  it('executes the complete operational lifecycle from permanent admin to audit reconciliation', async () => {
    // 1. Permanent Administrator Authentication & Closed Bootstrap Verification
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'administrator@hotspot.local',
        password: 'admin@123456',
      });
    expect(adminLoginRes.status).toBe(200);
    expect(adminLoginRes.body.owner.role).toBe('SUPER_ADMIN');

    // Subsequent bootstrap attempt must fail permanently because system is already initialized
    const boot2 = await request(app)
      .post('/api/v1/admin/bootstrap')
      .send({ email: 'hacker@hotspot.org', password: 'Password123!' });
    expect(boot2.status).toBe(400);
    expect(boot2.body.error.code).toBe('BOOTSTRAP_FAILED');

    // 2. Owner Registration & Authentication
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'cafe.owner@hotspot.org',
        password: 'OwnerPasswordSecure2026!',
        businessName: 'Airport Hotspot Cafe',
        currency: 'USD',
      });
    expect(regRes.status).toBe(201);
    const ownerToken = regRes.body.token;
    const ownerId = regRes.body.owner.id;
    expect(ownerToken).toBeTruthy();
    expect(ownerId).toBeTruthy();

    const authHeaders = { Authorization: `Bearer ${ownerToken}` };

    // 3. Create Access Package
    const pkgRes = await request(app)
      .post('/api/v1/packages')
      .set(authHeaders)
      .send({
        name: '2-Hour Flight Pass',
        durationSeconds: 7200,
        priceMinor: 600,
        currency: 'USD',
      });
    expect(pkgRes.status).toBe(201);
    const packageId = pkgRes.body.package.id;
    expect(packageId).toBeTruthy();

    // 4. Issue Voucher
    const coupRes = await request(app)
      .post('/api/v1/coupons')
      .set(authHeaders)
      .send({
        code: 'FLIGHT2HR',
        packageId,
        maxUses: 10,
      });
    expect(coupRes.status).toBe(201);

    // 5. Customer Self-Service Captive Portal: Redeem Voucher
    const redeemRes = await request(app)
      .post('/api/v1/sessions/redeem')
      .send({
        ownerId,
        code: 'flight2hr', // Tests uppercase normalization
        deviceMac: '11:22:33:44:55:66',
      });
    expect(redeemRes.status).toBe(201);
    expect(redeemRes.body.session.status).toBe('active');
    expect(redeemRes.body.session.remainingSeconds).toBe(7200);
    expect(redeemRes.body.session.deviceMac).toBe('11:22:33:44:55:66');
    const voucherSessionId = redeemRes.body.session.id;

    // Public Status Poll
    const pollRes = await request(app).get(`/api/v1/sessions/public/${voucherSessionId}`);
    expect(pollRes.status).toBe(200);
    expect(pollRes.body.session.status).toBe('active');

    // 6. Walk-in Customer Cash Desk Payment
    const createSessRes = await request(app)
      .post('/api/v1/sessions')
      .set(authHeaders)
      .send({
        packageId,
        deviceMac: '22:33:44:55:66:77',
      });
    expect(createSessRes.status).toBe(201);
    const cashSessionId = createSessRes.body.session.id;

    const cashRes = await request(app)
      .post('/api/v1/payments/manual-cash')
      .set(authHeaders)
      .send({
        sessionId: cashSessionId,
        packageId,
        amountMinor: 600,
        currency: 'USD',
        referenceNote: 'Walk-in traveler at Gate 4',
      });
    expect(cashRes.status).toBe(201);
    expect(cashRes.body.receiptNumber).toMatch(/^CASH-\d+/);
    expect(cashRes.body.payment.amountMinor).toBe(600);

    // Activate Cash Session
    const actRes = await request(app)
      .post(`/api/v1/sessions/${cashSessionId}/activate`)
      .set(authHeaders);
    expect(actRes.status).toBe(200);
    expect(actRes.body.session.status).toBe('active');

    // 7. Session Pause and Resume Cycle
    const pauseRes = await request(app)
      .post(`/api/v1/sessions/${cashSessionId}/pause`)
      .set(authHeaders);
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.session.status).toBe('paused');

    const resumeRes = await request(app)
      .post(`/api/v1/sessions/${cashSessionId}/resume`)
      .set(authHeaders);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.session.status).toBe('active');

    // 8. Financial Reconciliation & Ledger Audit
    const recRes = await request(app)
      .get('/api/v1/payments/reconcile')
      .set(authHeaders);
    expect(recRes.status).toBe(200);
    expect(recRes.body.report.status).toBe('balanced');
    expect(recRes.body.report.discrepancyMinor).toBe(0);

    const ledgerRes = await request(app)
      .get('/api/v1/payments/ledger')
      .set(authHeaders);
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.balance.netBalanceMinor).toBe(600);

    // 9. Analytics Overview Verification
    const anaRes = await request(app)
      .get('/api/v1/analytics/overview')
      .set(authHeaders);
    expect(anaRes.status).toBe(200);
    expect(anaRes.body.revenue.totalRevenueMinor).toBe(600);
    expect(anaRes.body.sessions.active).toBe(2);

    // 10. Cross-Tenant Security Isolation
    const intruderReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'intruder@otherhotel.org',
        password: 'IntruderPass999!',
        businessName: 'Competitor Hotspot',
        currency: 'USD',
      });
    expect(intruderReg.status).toBe(201);
    const intruderHeaders = { Authorization: `Bearer ${intruderReg.body.token}` };

    const intruderSessions = await request(app)
      .get('/api/v1/sessions')
      .set(intruderHeaders);
    expect(intruderSessions.status).toBe(200);
    expect(intruderSessions.body.sessions).toHaveLength(0); // Zero leakage!

    const intruderTamper = await request(app)
      .post(`/api/v1/sessions/${cashSessionId}/revoke`)
      .set(intruderHeaders);
    expect(intruderTamper.status).toBe(400); // Tenant-isolated rejection
    expect(intruderTamper.body.error.code).toBe('REVOCATION_FAILED');
  });
});
