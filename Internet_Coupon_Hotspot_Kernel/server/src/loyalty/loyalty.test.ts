import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryDatabase } from '../db/repositories.js';
import { LoyaltyService } from './service.js';
import { createLoyaltyRouter } from './routes.js';

describe('Phase 14: Explainable Segments, Badges & Bounded Bonuses', () => {
  let db: MemoryDatabase;
  let service: LoyaltyService;
  let app: express.Express;
  const ownerId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db = new MemoryDatabase();
    service = new LoyaltyService(db);
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

    app.use('/api/v1/loyalty', createLoyaltyRouter(service, mockAuth));
  });

  it('classifies a new customer created today as NEW segment with explainable criteria', async () => {
    const cust = await db.customers.create({
      ownerId,
      displayName: 'New Visitor',
      phone: '+15550001',
    });

    const res = await request(app).get(`/api/v1/loyalty/customers/${cust.id}`);
    expect(res.status).toBe(200);
    expect(res.body.segment).toBe('NEW');
    expect(res.body.segmentExplanation.criteria).toContain('within the last 7 days');
    expect(res.body.segmentExplanation.evidence.daysSinceCreated).toBe(0);
  });

  it('classifies customer with spend >= 5000 minor units as VIP with criteria evidence', async () => {
    const cust = await db.customers.create({
      ownerId,
      displayName: 'High Spender',
      phone: '+15550002',
    });

    await db.payments.create({
      ownerId,
      customerId: cust.id,
      amountMinor: 6000,
      currency: 'USD',
      provider: 'stripe_sandbox',
      status: 'completed',
      idempotencyKey: 'idem-vip-1',
    });

    const res = await request(app).get(`/api/v1/loyalty/customers/${cust.id}`);
    expect(res.status).toBe(200);
    expect(res.body.segment).toBe('VIP');
    expect(res.body.lifetimeSpendMinor).toBe(6000);
    expect(res.body.segmentExplanation.criteria).toContain('High cumulative spend');
  });

  it('awards a loyalty badge with evidence and saves audit event', async () => {
    const cust = await db.customers.create({
      ownerId,
      displayName: 'Super Fan',
    });

    const res = await request(app)
      .post('/api/v1/loyalty/badges')
      .send({
        customerId: cust.id,
        badgeCode: 'COMMUNITY_REGULAR',
        evidence: { totalVisits: 10, favoritePackage: 'Weekly Unlimited' },
      });

    expect(res.status).toBe(201);
    expect(res.body.badge.badgeCode).toBe('COMMUNITY_REGULAR');
    expect(res.body.badge.name).toBe('Community Regular');

    const auditList = await db.audit.list(ownerId);
    expect(auditList.some((a) => a.action === 'LOYALTY_BADGE_AWARDED')).toBe(true);
  });

  it('grants a bounded bonus, enforces abuse limits (max 3), and allows claiming', async () => {
    const cust = await db.customers.create({
      ownerId,
      displayName: 'Bonus Recipient',
    });

    const expiresAt = new Date(Date.now() + 86400000).toISOString();

    // Grant 1st bonus
    const grant1 = await request(app)
      .post('/api/v1/loyalty/bonuses')
      .send({
        customerId: cust.id,
        bonusType: 'free_minutes',
        amountUnits: 30, // 30 free minutes
        budgetDeductionMinor: 100,
        currency: 'USD',
        expiresAt,
        auditReason: 'Customer Appreciation Bonus',
      });
    expect(grant1.status).toBe(201);
    expect(grant1.body.bonus.status).toBe('active');
    const bonusId = grant1.body.bonus.id;

    // Grant 2nd & 3rd
    await request(app).post('/api/v1/loyalty/bonuses').send({
      customerId: cust.id,
      bonusType: 'free_minutes',
      amountUnits: 15,
      budgetDeductionMinor: 50,
      currency: 'USD',
      expiresAt,
      auditReason: 'Survey response',
    });
    await request(app).post('/api/v1/loyalty/bonuses').send({
      customerId: cust.id,
      bonusType: 'free_minutes',
      amountUnits: 15,
      budgetDeductionMinor: 50,
      currency: 'USD',
      expiresAt,
      auditReason: 'Weekend promo',
    });

    // 4th bonus should fail due to abuse limits
    const grant4 = await request(app)
      .post('/api/v1/loyalty/bonuses')
      .send({
        customerId: cust.id,
        bonusType: 'free_minutes',
        amountUnits: 10,
        budgetDeductionMinor: 30,
        currency: 'USD',
        expiresAt,
        auditReason: 'Exceeding limit',
      });
    expect(grant4.status).toBe(400);
    expect(grant4.body.error.message).toContain('Abuse protection limit reached');

    // Claim 1st bonus
    const claimRes = await request(app)
      .post(`/api/v1/loyalty/bonuses/${bonusId}/claim`)
      .send({ customerId: cust.id });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.bonus.status).toBe('claimed');
    expect(claimRes.body.bonus.claimedAt).toBeTruthy();
  });
});
