import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryDatabase } from '../db/repositories.js';
import { AIService, scrubPii } from './service.js';
import { createAIRouter } from './routes.js';

describe('Phase 15 & 16: AI Provider Registry, Quota Management & Copilot', () => {
  let db: MemoryDatabase;
  let service: AIService;
  let app: express.Express;
  const ownerId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    db = new MemoryDatabase();
    service = new AIService(db);
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

    app.use('/api/v1/ai', createAIRouter(service, mockAuth));

    // Seed test business metrics
    await db.ledger.create({
      ownerId,
      entryType: 'sale',
      amountMinor: 5000,
      currency: 'USD',
      description: 'Monthly Pass',
    });

    const pkg = await db.packages.create({
      ownerId,
      name: 'Ultra Speed 2hr',
      durationSeconds: 7200,
      priceMinor: 600,
      currency: 'USD',
      active: true,
    });

    await db.sessions.create({
      ownerId,
      packageId: pkg.id,
      durationSeconds: 7200,
      remainingSeconds: 3600,
      status: 'active',
    });
  });

  it('registers an AI provider, masks the API key, and never returns stored secrets', async () => {
    const res = await request(app)
      .post('/api/v1/ai/providers')
      .send({
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        type: 'hosted',
        apiKey: 'AIzaSyTestApiKeySecret12345',
        isFreeTier: true,
        priority: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.provider.maskedKey).toBe('AIza...2345');
    expect(res.body.provider.apiKeyEncrypted).toBeUndefined();
    expect(res.body.provider.health).toBe('healthy');

    // Fetch list
    const listRes = await request(app).get('/api/v1/ai/providers');
    expect(listRes.status).toBe(200);
    expect(listRes.body.providers).toHaveLength(1);
    expect(listRes.body.providers[0].maskedKey).toBe('AIza...2345');
    expect(listRes.body.providers[0].apiKeyEncrypted).toBeUndefined();
  });

  it('runs health check and returns quota evidence', async () => {
    const reg = await service.registerProvider(ownerId, {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      type: 'hosted',
      isFreeTier: true,
    });

    const testRes = await request(app).post(`/api/v1/ai/providers/${reg.id}/test`);
    expect(testRes.status).toBe(200);
    expect(testRes.body.health).toBe('healthy');
    expect(testRes.body.quotaEvidence.source).toBe('official_header');
    expect(testRes.body.quotaEvidence.remainingRequests).toBeGreaterThan(0);
  });

  it('scrubs PII such as email, phone, MAC, and credit cards before synthesis', () => {
    const dirty = 'Customer john@example.com on 00:1A:2B:3C:4D:5E called +15551234567 about card 4111 2222 3333 4444';
    const clean = scrubPii(dirty);

    expect(clean).not.toContain('john@example.com');
    expect(clean).not.toContain('00:1A:2B:3C:4D:5E');
    expect(clean).not.toContain('+15551234567');
    expect(clean).not.toContain('4111 2222 3333 4444');
    expect(clean).toContain('[REDACTED_EMAIL]');
    expect(clean).toContain('[REDACTED_MAC]');
    expect(clean).toContain('[REDACTED_PHONE]');
    expect(clean).toContain('[REDACTED_CARD]');
  });

  it('answers copilot questions with grounded facts and strict safety restrictions', async () => {
    const res = await request(app)
      .post('/api/v1/ai/copilot')
      .send({ question: 'What is our current sales and revenue status?' });

    expect(res.status).toBe(200);
    expect(res.body.response).toContain('gross sales are USD 50.00');
    expect(res.body.response).toContain('1 active user session');
    expect(res.body.safetyPolicy.requiresOwnerConfirmation).toBe(true);
    expect(res.body.safetyPolicy.automatedActionPermitted).toBe(false);
  });

  it('provides revenue forecasts with minimum-data warnings and anomaly detection', async () => {
    const forecastRes = await request(app).get('/api/v1/ai/forecast');
    expect(forecastRes.status).toBe(200);
    expect(forecastRes.body.projectedRevenueMinor).toBeGreaterThan(0);
    expect(forecastRes.body.minimumDataWarning).toBeTruthy();

    const anomaliesRes = await request(app).get('/api/v1/ai/anomalies');
    expect(anomaliesRes.status).toBe(200);
    expect(anomaliesRes.body).toHaveProperty('anomalies');
  });

  it('drafts a privacy-safe support response for customer WiFi trouble', async () => {
    const draftRes = await request(app)
      .post('/api/v1/ai/support-draft')
      .send({ customerIssue: 'My phone +1234567 cannot connect to the hotspot login portal.' });

    expect(draftRes.status).toBe(200);
    expect(draftRes.body.originalIssueCleaned).toContain('[REDACTED_PHONE]');
    expect(draftRes.body.draftResponse).toContain('login portal');
    expect(draftRes.body.disclaimer).toBeTruthy();
  });
});
