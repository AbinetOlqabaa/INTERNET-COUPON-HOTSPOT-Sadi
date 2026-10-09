import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { defaultDb } from '../db/repositories.js';

describe('Phase 8: Server-Authoritative Session State Machine & Clocks', () => {
  let ownerAToken: string;
  let ownerAId: string;
  let ownerBToken: string;
  let packageAId: string;

  beforeEach(async () => {
    // Register Owner A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `session_owner_a_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`,
        password: 'Password123!',
        businessName: 'Session Hotspot A',
      });
    ownerAToken = resA.body.token;
    ownerAId = resA.body.owner.id;

    // Register Owner B for isolation tests
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `session_owner_b_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`,
        password: 'Password123!',
        businessName: 'Session Hotspot B',
      });
    ownerBToken = resB.body.token;

    // Create 1-hour package for Owner A
    const pkgRes = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: '1-Hour Express',
        durationSeconds: 3600,
        priceMinor: 300,
        currency: 'USD',
      });
    packageAId = pkgRes.body.package.id;
  });

  it('creates a session in awaiting_payment status and respects duration seconds', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        deviceMac: 'AA:BB:CC:11:22:33',
        clientIp: '192.168.1.50',
      });

    expect(res.status).toBe(201);
    expect(res.body.session.id).toBeDefined();
    expect(res.body.session.status).toBe('awaiting_payment');
    expect(res.body.session.durationSeconds).toBe(3600);
    expect(res.body.session.remainingSeconds).toBe(3600);
    expect(res.body.session.activatedAt).toBeNull();
    expect(res.body.session.expiresAt).toBeNull();
  });

  it('activates session, records authoritative UTC timestamps, and runs duration clock', async () => {
    // 1. Create session
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        deviceMac: '11:22:33:44:55:66',
        initialStatus: 'payment_verified',
      });
    const sessionId = createRes.body.session.id;

    // 2. Activate session
    const actRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/activate`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(actRes.status).toBe(200);
    expect(actRes.body.session.status).toBe('active');
    expect(actRes.body.session.activatedAt).toBeDefined();
    expect(actRes.body.session.expiresAt).toBeDefined();

    const activatedAt = new Date(actRes.body.session.activatedAt).getTime();
    const expiresAt = new Date(actRes.body.session.expiresAt).getTime();
    expect(expiresAt - activatedAt).toBe(3600 * 1000);

    // 3. Query details: evaluates remaining seconds
    const detailRes = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.session.remainingSeconds).toBeGreaterThanOrEqual(3595);
    expect(detailRes.body.session.remainingSeconds).toBeLessThanOrEqual(3600);
  });

  it('rejects illegal activation if payment is not verified', async () => {
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        initialStatus: 'awaiting_payment',
      });
    const sessionId = createRes.body.session.id;

    const actRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/activate`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(actRes.status).toBe(400);
    expect(actRes.body.error.message).toContain('Illegal state transition');
  });

  it('extends duration of an active session with updated expiration timestamp', async () => {
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        initialStatus: 'payment_verified',
      });
    const sessionId = createRes.body.session.id;

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/activate`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    // Add 1800 seconds (30 minutes)
    const extendRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/extend`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ additionalSeconds: 1800 });

    expect(extendRes.status).toBe(200);
    expect(extendRes.body.session.durationSeconds).toBe(5400); // 3600 + 1800
    expect(extendRes.body.session.remainingSeconds).toBeGreaterThanOrEqual(5390);
  });

  it('pauses and resumes an active session, recalculating expiry on resume', async () => {
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        initialStatus: 'payment_verified',
      });
    const sessionId = createRes.body.session.id;

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/activate`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    // Pause session
    const pauseRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/pause`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ reason: 'Customer requested pause while eating lunch' });

    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.session.status).toBe('paused');
    const pausedRemaining = pauseRes.body.session.remainingSeconds;
    expect(pausedRemaining).toBeGreaterThan(0);

    // Resume session
    const resumeRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/resume`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.session.status).toBe('active');
    expect(resumeRes.body.session.expiresAt).toBeDefined();
  });

  it('revokes an active session administratively', async () => {
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        initialStatus: 'payment_verified',
      });
    const sessionId = createRes.body.session.id;

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/activate`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    const revokeRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/revoke`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ reason: 'Violation of Terms of Service' });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.session.status).toBe('revoked');
    expect(revokeRes.body.session.remainingSeconds).toBe(0);
  });

  it('reconciles elapsed active sessions to expired state', async () => {
    // Manually create an active session whose expiresAt was in the past
    const pastExpiresAt = new Date(Date.now() - 60000).toISOString();
    const pastActivatedAt = new Date(Date.now() - 3660000).toISOString();

    const expiredSession = await defaultDb.sessions.create({
      ownerId: ownerAId,
      customerId: null,
      packageId: packageAId,
      status: 'active',
      durationSeconds: 3600,
      remainingSeconds: 3600,
      activatedAt: pastActivatedAt,
      expiresAt: pastExpiresAt,
    });

    // Run reconciliation endpoint
    const reconRes = await request(app)
      .post('/api/v1/sessions/reconcile-expiry')
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(reconRes.status).toBe(200);
    expect(reconRes.body.expiredCount).toBeGreaterThanOrEqual(1);

    // Check status in DB
    const checked = await defaultDb.sessions.findById(ownerAId, expiredSession.id);
    expect(checked?.status).toBe('expired');
  });

  it('redeems a voucher code directly into an activated access session', async () => {
    // 1. Create a voucher
    const couponRes = await request(app)
      .post('/api/v1/coupons')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        code: `PASS_${Date.now()}`,
        packageId: packageAId,
        maxUses: 1,
      });
    const code = couponRes.body.coupon.code;

    // 2. Customer redeems voucher
    const redeemRes = await request(app)
      .post('/api/v1/sessions/redeem')
      .send({
        ownerId: ownerAId,
        code,
        deviceMac: 'EE:FF:11:22:33:44',
      });

    expect(redeemRes.status).toBe(201);
    expect(redeemRes.body.session.status).toBe('active');
    expect(redeemRes.body.session.deviceMac).toBe('EE:FF:11:22:33:44');
    expect(redeemRes.body.session.durationSeconds).toBe(3600);
    expect(redeemRes.body.packageName).toBe('1-Hour Express');
  });

  it('serves public captive portal session status poll without authentication', async () => {
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
        initialStatus: 'payment_verified',
      });
    const sessionId = createRes.body.session.id;

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/activate`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    // Public lookup
    const pubRes = await request(app).get(`/api/v1/sessions/public/${sessionId}`);
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.session.id).toBe(sessionId);
    expect(pubRes.body.session.status).toBe('active');
    expect(pubRes.body.session.packageName).toBe('1-Hour Express');
    expect(pubRes.body.session.remainingSeconds).toBeGreaterThan(0);
  });

  it('enforces cross-tenant owner isolation on sessions', async () => {
    const createRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        packageId: packageAId,
      });
    const sessionId = createRes.body.session.id;

    // Owner B cannot view Owner A's session
    const otherRes = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${ownerBToken}`);

    expect(otherRes.status).toBe(404);
  });
});
