import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryDatabase } from '../db/repositories.js';
import { AnalyticsService } from './service.js';
import { createAnalyticsRouter } from './routes.js';

describe('Phase 13: Analytics, Usage, Retention & Exports', () => {
  let db: MemoryDatabase;
  let service: AnalyticsService;
  let app: express.Express;
  const ownerId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    db = new MemoryDatabase();
    service = new AnalyticsService(db);
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

    app.use('/api/v1/analytics', createAnalyticsRouter(service, mockAuth));

    // Seed test data
    await db.ledger.create({
      ownerId,
      entryType: 'sale',
      amountMinor: 1500,
      currency: 'USD',
      description: '1-Hour WiFi Sale',
      account: 'revenue',
    });

    await db.ledger.create({
      ownerId,
      entryType: 'sale',
      amountMinor: 2500,
      currency: 'USD',
      description: 'Day Pass Sale',
      account: 'revenue',
    });

    await db.ledger.create({
      ownerId,
      entryType: 'refund',
      amountMinor: -500,
      currency: 'USD',
      description: 'Partial Refund',
      account: 'refunds',
    });

    const cust1 = await db.customers.create({
      ownerId,
      displayName: 'Alice',
      phone: '+1234567890',
      consentAcceptedAt: new Date().toISOString(),
    });

    const cust2 = await db.customers.create({
      ownerId,
      displayName: 'Bob',
      phone: '+1987654321',
    });

    const pkg = await db.packages.create({
      ownerId,
      name: 'Standard Package',
      durationSeconds: 3600,
      priceMinor: 500,
      currency: 'USD',
      active: true,
    });

    // Cust 1 has 2 sessions (repeat)
    await db.sessions.create({
      ownerId,
      customerId: cust1.id,
      packageId: pkg.id,
      durationSeconds: 3600,
      remainingSeconds: 1800,
      status: 'active',
    });

    await db.sessions.create({
      ownerId,
      customerId: cust1.id,
      packageId: pkg.id,
      durationSeconds: 3600,
      remainingSeconds: 0,
      status: 'expired',
    });

    // Cust 2 has 1 session
    await db.sessions.create({
      ownerId,
      customerId: cust2.id,
      packageId: pkg.id,
      durationSeconds: 3600,
      remainingSeconds: 0,
      status: 'expired',
    });
  });

  it('calculates aggregated overview metrics with integer minor units and source labels', async () => {
    const res = await request(app).get('/api/v1/analytics/overview');
    expect(res.status).toBe(200);

    expect(res.body.revenue.totalRevenueMinor).toBe(4000);
    expect(res.body.revenue.totalRefundsMinor).toBe(500);
    expect(res.body.revenue.netBalanceMinor).toBe(3500);
    expect(res.body.revenue.currency).toBe('USD');

    expect(res.body.sessions.total).toBe(3);
    expect(res.body.sessions.active).toBe(1);
    expect(res.body.sessions.expired).toBe(2);

    expect(res.body.customers.total).toBe(2);
    expect(res.body.customers.withConsent).toBe(1);

    expect(res.body.dataFreshness.sourceLabels).toContain('ledger_journal_verified');
  });

  it('returns daily revenue breakdown and time series', async () => {
    const res = await request(app).get('/api/v1/analytics/revenue');
    expect(res.status).toBe(200);
    expect(res.body.timeSeries.length).toBeGreaterThanOrEqual(1);
    expect(res.body.timeSeries[0].grossMinor).toBe(4000);
    expect(res.body.timeSeries[0].refundsMinor).toBe(500);
    expect(res.body.timeSeries[0].netMinor).toBe(3500);
  });

  it('returns usage and delivered hours metrics', async () => {
    const res = await request(app).get('/api/v1/analytics/usage');
    expect(res.status).toBe(200);
    // 3 sessions * 3600 seconds = 10800 seconds = 3.0 hours
    expect(res.body.totalDeliveredHours).toBe(3.0);
    expect(res.body.packageBreakdown.length).toBe(1);
    expect(res.body.packageBreakdown[0].sessionCount).toBe(3);
  });

  it('computes retention metrics accurately for returning customers', async () => {
    const res = await request(app).get('/api/v1/analytics/retention');
    expect(res.status).toBe(200);
    expect(res.body.totalCustomers).toBe(2);
    expect(res.body.returningCustomers).toBe(1);
    expect(res.body.retentionRatePercentage).toBe(50);
  });

  it('exports ledger and sessions as CSV files with proper headers and data', async () => {
    const ledgerExport = await request(app).get('/api/v1/analytics/export?type=ledger');
    expect(ledgerExport.status).toBe(200);
    expect(ledgerExport.headers['content-type']).toContain('text/csv');
    expect(ledgerExport.text).toContain('ID,Date,EntryType,Account,AmountMinor');
    expect(ledgerExport.text).toContain('1500');

    const sessionsExport = await request(app).get('/api/v1/analytics/export?type=sessions');
    expect(sessionsExport.status).toBe(200);
    expect(sessionsExport.headers['content-type']).toContain('text/csv');
    expect(sessionsExport.text).toContain('ID,CustomerID,PackageID,Status,DurationSeconds');
  });
});
