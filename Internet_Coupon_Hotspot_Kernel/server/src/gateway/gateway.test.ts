import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { defaultDb } from '../db/repositories.js';

describe('Phase 9: Gateway Adapter Interface, Capability Discovery, Health & Telemetry', () => {
  let ownerToken: string;
  let ownerId: string;

  beforeEach(async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `gateway_owner_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`,
        password: 'Password123!',
        businessName: 'Gateway Hotspot Ops',
      });
    ownerToken = regRes.body.token;
    ownerId = regRes.body.owner.id;
  });

  it('discovers honest capabilities for Limited Owner Mode (Android system hotspot)', async () => {
    const res = await request(app)
      .get('/api/v1/gateways')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.activeAdapter).toBe('limited_owner');
    expect(res.body.capabilities.canDisconnectClient).toBe(false);
    expect(res.body.capabilities.canLimitBandwidth).toBe(false);
    expect(res.body.capabilities.canMeasureTraffic).toBe(false);
    expect(res.body.capabilities.requiresHardwareGateway).toBe(false);
    expect(res.body.capabilities.disclosureStatement).toContain('Standard Android hotspot mode cannot enforce');
  });

  it('registers a Mock Test Gateway and discovers managed router capabilities (TEST ONLY)', async () => {
    const regGw = await request(app)
      .post('/api/v1/gateways')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Local Test Gateway Simulator',
        mode: 'managed_gateway_mode',
        adapterType: 'mock_test_gateway',
        host: '192.168.88.1',
        port: 8728,
      });

    expect(regGw.status).toBe(201);
    expect(regGw.body.gateway.adapterType).toBe('mock_test_gateway');
    expect(regGw.body.capabilities.canDisconnectClient).toBe(true);
    expect(regGw.body.capabilities.canLimitBandwidth).toBe(true);
    expect(regGw.body.capabilities.canMeasureTraffic).toBe(true);
    expect(regGw.body.capabilities.disclosureStatement).toContain('TEST ONLY');
  });

  it('queries gateway live health checks', async () => {
    // 1. Register test gateway
    const regGw = await request(app)
      .post('/api/v1/gateways')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Health Check Gateway',
        mode: 'managed_gateway_mode',
        adapterType: 'mock_test_gateway',
      });
    const gatewayId = regGw.body.gateway.id;

    // 2. Query health
    const healthRes = await request(app)
      .get(`/api/v1/gateways/${gatewayId}/health`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.health.status).toBe('online');
    expect(healthRes.body.health.latencyMs).toBeDefined();
    expect(healthRes.body.health.version).toContain('MockGatewayOS');
  });

  it('authorizes client MAC, queries traffic accounting, and executes disconnection on Mock Gateway', async () => {
    const clientMac = '12:34:56:78:9A:BC';

    // 1. Register Mock Gateway
    const regGw = await request(app)
      .post('/api/v1/gateways')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Accounting Gateway',
        mode: 'managed_gateway_mode',
        adapterType: 'mock_test_gateway',
      });
    const gatewayId = regGw.body.gateway.id;

    // 2. Create and activate a session linked to this gateway
    const pkg = await defaultDb.packages.create({
      ownerId,
      name: 'Test Turbo',
      durationSeconds: 1800,
      priceMinor: 200,
      currency: 'USD',
      speedLimitDownKbps: 20000,
      speedLimitUpKbps: 5000,
      active: true,
    });

    const createSession = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        packageId: pkg.id,
        deviceMac: clientMac,
        gatewayId,
        initialStatus: 'payment_verified',
      });

    await request(app)
      .post(`/api/v1/sessions/${createSession.body.session.id}/activate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // 3. Query traffic accounting for client MAC
    const acctRes = await request(app)
      .get(`/api/v1/gateways/${gatewayId}/accounting/${clientMac}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(acctRes.status).toBe(200);
    expect(acctRes.body.accounting.online).toBe(true);
    expect(acctRes.body.accounting.measured).toBe(true);
    expect(acctRes.body.accounting.bytesDown).toBeGreaterThanOrEqual(1048576);

    // 4. Disconnect client MAC
    const disconnRes = await request(app)
      .post(`/api/v1/gateways/${gatewayId}/disconnect`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        clientMac,
        reason: 'Manual operator kick',
      });

    expect(disconnRes.status).toBe(200);
    expect(disconnRes.body.result.success).toBe(true);
    expect(disconnRes.body.result.command).toBe('disconnect');

    // 5. Accounting after disconnect shows offline
    const postAcct = await request(app)
      .get(`/api/v1/gateways/${gatewayId}/accounting/${clientMac}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(postAcct.status).toBe(200);
    expect(postAcct.body.accounting.online).toBe(false);
  });

  it('rejects client disconnection on Limited Owner Mode with honest disclosure', async () => {
    // Register Limited Owner Gateway
    const regGw = await request(app)
      .post('/api/v1/gateways')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Android Phone Hotspot',
        mode: 'limited_owner_mode',
        adapterType: 'limited_owner',
      });
    const gatewayId = regGw.body.gateway.id;

    const disconnRes = await request(app)
      .post(`/api/v1/gateways/${gatewayId}/disconnect`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        clientMac: 'CC:DD:EE:FF:11:22',
      });

    expect(disconnRes.status).toBe(200);
    expect(disconnRes.body.result.success).toBe(false);
    expect(disconnRes.body.result.disclosure).toContain('Standard Android hotspot mode cannot disconnect individual clients');
  });

  it('ingests external gateway event callback', async () => {
    const eventRes = await request(app)
      .post('/api/v1/gateways/events')
      .send({
        ownerId,
        eventType: 'client_lease_acquired',
        clientMac: 'AA:11:BB:22:CC:33',
        bytesDown: 50000,
        bytesUp: 10000,
      });

    expect(eventRes.status).toBe(200);
    expect(eventRes.body.acknowledged).toBe(true);
    expect(eventRes.body.eventId).toBeDefined();

    // Verify written to audit log
    const audits = await defaultDb.audit.list(ownerId);
    const gwAudit = audits.find((a) => a.action === 'gateway.event_client_lease_acquired');
    expect(gwAudit).toBeDefined();
  });
});
