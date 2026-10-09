import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';
import type { GatewayService } from './service.js';

export function createGatewayRouter(
  db: RepositoryRegistry,
  gatewayService: GatewayService,
  authMiddleware: RequestHandler
): Router {
  const router = Router();

  const RegisterGatewaySchema = z.object({
    name: z.string().min(1).max(64),
    mode: z.enum(['limited_owner_mode', 'managed_gateway_mode']).default('limited_owner_mode'),
    adapterType: z.string().min(1).default('limited_owner'),
    host: z.string().nullable().optional(),
    port: z.number().int().positive().nullable().optional(),
    apiKeyEncrypted: z.string().nullable().optional(),
  });

  const DisconnectSchema = z.object({
    clientMac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address'),
    reason: z.string().max(128).optional(),
  });

  const IngestEventSchema = z.object({
    ownerId: z.string().uuid(),
    eventType: z.string().min(1),
    clientMac: z.string().optional(),
    bytesDown: z.number().int().nonnegative().optional(),
    bytesUp: z.number().int().nonnegative().optional(),
    timestamp: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  });

  // POST /api/v1/gateways/events - Public Webhook / Callback Ingestion from Router Hardware
  router.post('/events', async (req: Request, res: Response) => {
    try {
      const parsed = IngestEventSchema.parse(req.body);
      const result = await gatewayService.ingestGatewayEvent(parsed.ownerId, parsed);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid event payload';
      res.status(400).json({ error: { code: 'INVALID_EVENT', message } });
    }
  });

  // Protected Owner Routes Below
  router.use(authMiddleware);

  // GET /api/v1/gateways - List gateways & discovered capabilities
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const gateways = await db.gateways.list(ownerId);
      const { adapter } = await gatewayService.resolveAdapterForOwner(ownerId);
      const capabilities = adapter.getCapabilities();

      res.json({
        gateways,
        activeAdapter: adapter.name,
        capabilities,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list gateways';
      res.status(500).json({ error: { code: 'GATEWAY_ERROR', message } });
    }
  });

  // POST /api/v1/gateways - Register gateway
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = RegisterGatewaySchema.parse(req.body);

      // Verify adapter is registered
      const adapter = gatewayService.getAdapter(parsed.adapterType);

      const gateway = await db.gateways.create({
        ownerId,
        name: parsed.name,
        mode: parsed.mode,
        adapterType: parsed.adapterType,
        host: parsed.host || null,
        port: parsed.port || null,
        apiKeyEncrypted: parsed.apiKeyEncrypted || null,
        status: adapter.name === 'limited_owner' ? 'unmanaged' : 'online',
        lastSeenAt: new Date().toISOString(),
      });

      res.status(201).json({
        gateway,
        capabilities: adapter.getCapabilities(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register gateway';
      res.status(400).json({ error: { code: 'GATEWAY_REGISTRATION_FAILED', message } });
    }
  });

  // GET /api/v1/gateways/:id/health - Query gateway health
  router.get('/:id/health', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const health = await gatewayService.checkHealth(ownerId, req.params.id);
      res.json({ health });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query gateway health';
      res.status(400).json({ error: { code: 'GATEWAY_HEALTH_FAILED', message } });
    }
  });

  // POST /api/v1/gateways/:id/disconnect - Disconnect MAC
  router.post('/:id/disconnect', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = DisconnectSchema.parse(req.body);
      const gateway = await db.gateways.findById(ownerId, req.params.id);
      if (!gateway) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gateway not found' } });
        return;
      }

      const adapter = gatewayService.getAdapter(gateway.adapterType);
      const result = await adapter.disconnectClient(parsed.clientMac, parsed.reason);

      res.json({ result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect client';
      res.status(400).json({ error: { code: 'DISCONNECT_FAILED', message } });
    }
  });

  // GET /api/v1/gateways/:id/accounting/:mac - Query traffic accounting
  router.get('/:id/accounting/:mac', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const data = await gatewayService.queryAccounting(ownerId, req.params.mac, req.params.id);
      res.json({ accounting: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query accounting';
      res.status(400).json({ error: { code: 'ACCOUNTING_FAILED', message } });
    }
  });

  return router;
}
