import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { RepositoryRegistry } from '../db/repositories.js';
import type { AuthenticatedRequest } from '../auth/routes.js';
import type { SessionService } from './service.js';

export function createSessionRouter(
  db: RepositoryRegistry,
  sessionService: SessionService,
  authMiddleware: RequestHandler
): Router {
  const router = Router();

  const CreateSessionSchema = z.object({
    packageId: z.string().uuid(),
    customerId: z.string().uuid().nullable().optional(),
    deviceMac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address').optional(),
    clientIp: z.string().optional(),
    gatewayId: z.string().uuid().nullable().optional(),
    initialStatus: z.enum(['created', 'awaiting_payment', 'payment_verified']).optional(),
  });

  const ExtendSessionSchema = z.object({
    additionalSeconds: z.number().int().positive('Additional duration must be positive integer seconds'),
  });

  const PauseSessionSchema = z.object({
    reason: z.string().min(1).max(128).default('Administrative pause'),
  });

  const RevokeSessionSchema = z.object({
    reason: z.string().min(1).max(128).default('Administrative revocation'),
  });

  const RedeemVoucherSchema = z.object({
    ownerId: z.string().uuid(),
    code: z.string().min(1).max(32),
    customerId: z.string().uuid().nullable().optional(),
    deviceMac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address').optional(),
    clientIp: z.string().optional(),
  });

  // Public Endpoint: Captive portal status poll
  router.get('/public/:id', async (req: Request, res: Response) => {
    try {
      const status = await sessionService.getPublicSessionStatus(req.params.id);
      if (!status) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' } });
        return;
      }
      res.json({ session: status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query session';
      res.status(500).json({ error: { code: 'QUERY_FAILED', message } });
    }
  });

  // Public Endpoint: Voucher redemption directly for customer captive portal
  router.post('/redeem', async (req: Request, res: Response) => {
    try {
      const parsed = RedeemVoucherSchema.parse(req.body);
      const result = await sessionService.redeemVoucherForSession({
        ownerId: parsed.ownerId,
        code: parsed.code,
        customerId: parsed.customerId,
        deviceMac: parsed.deviceMac,
        clientIp: parsed.clientIp,
        actor: 'customer:voucher_portal',
      });
      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Voucher redemption failed';
      res.status(400).json({ error: { code: 'REDEMPTION_FAILED', message } });
    }
  });

  // Protected Operator Endpoints Below
  router.use(authMiddleware);

  // POST /api/v1/sessions - Create session intent
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = CreateSessionSchema.parse(req.body);

      const session = await sessionService.createSession({
        ownerId,
        packageId: parsed.packageId,
        customerId: parsed.customerId,
        deviceMac: parsed.deviceMac,
        clientIp: parsed.clientIp,
        gatewayId: parsed.gatewayId,
        initialStatus: parsed.initialStatus,
      });

      res.status(201).json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid session payload';
      res.status(400).json({ error: { code: 'SESSION_CREATION_FAILED', message } });
    }
  });

  // GET /api/v1/sessions - List sessions with live evaluation
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
      const customerFilter = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;

      // First run passive expiry reconciliation
      await sessionService.reconcileExpiredSessions(ownerId);

      let sessions = await db.sessions.list(ownerId, statusFilter);
      if (customerFilter) {
        sessions = sessions.filter((s) => s.customerId === customerFilter);
      }

      // Compute live remaining seconds
      const evaluated = sessions.map((s) => ({
        ...s,
        remainingSeconds: sessionService.calculateRemainingSeconds(s),
      }));

      res.json({ sessions: evaluated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve sessions';
      res.status(500).json({ error: { code: 'SESSIONS_FETCH_FAILED', message } });
    }
  });

  // GET /api/v1/sessions/:id - Get session details
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const session = await sessionService.getSessionWithEvaluation(ownerId, req.params.id);
      if (!session) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
        return;
      }
      res.json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get session';
      res.status(500).json({ error: { code: 'SESSION_ERROR', message } });
    }
  });

  // POST /api/v1/sessions/:id/activate - Activate session
  router.post('/:id/activate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const actor = req.user?.email || req.userId || 'owner';
      const session = await sessionService.activateSession(ownerId, req.params.id, actor);
      res.json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Activation failed';
      res.status(400).json({ error: { code: 'ACTIVATION_FAILED', message } });
    }
  });

  // POST /api/v1/sessions/:id/extend - Extend session
  router.post('/:id/extend', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = ExtendSessionSchema.parse(req.body);
      const actor = req.user?.email || req.userId || 'owner';
      const session = await sessionService.extendSession(
        ownerId,
        req.params.id,
        parsed.additionalSeconds,
        actor
      );
      res.json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Extension failed';
      res.status(400).json({ error: { code: 'EXTENSION_FAILED', message } });
    }
  });

  // POST /api/v1/sessions/:id/pause - Pause session
  router.post('/:id/pause', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = PauseSessionSchema.parse(req.body);
      const actor = req.user?.email || req.userId || 'owner';
      const session = await sessionService.pauseSession(ownerId, req.params.id, parsed.reason, actor);
      res.json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pause failed';
      res.status(400).json({ error: { code: 'PAUSE_FAILED', message } });
    }
  });

  // POST /api/v1/sessions/:id/resume - Resume session
  router.post('/:id/resume', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const actor = req.user?.email || req.userId || 'owner';
      const session = await sessionService.resumeSession(ownerId, req.params.id, actor);
      res.json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resume failed';
      res.status(400).json({ error: { code: 'RESUME_FAILED', message } });
    }
  });

  // POST /api/v1/sessions/:id/revoke - Revoke session
  router.post('/:id/revoke', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const parsed = RevokeSessionSchema.parse(req.body);
      const actor = req.user?.email || req.userId || 'owner';
      const session = await sessionService.revokeSession(ownerId, req.params.id, parsed.reason, actor);
      res.json({ session });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Revocation failed';
      res.status(400).json({ error: { code: 'REVOCATION_FAILED', message } });
    }
  });

  // POST /api/v1/sessions/reconcile-expiry - Run expiration reconciliation
  router.post('/reconcile-expiry', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerId = req.ownerId!;
      const result = await sessionService.reconcileExpiredSessions(ownerId);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reconciliation failed';
      res.status(500).json({ error: { code: 'RECONCILIATION_FAILED', message } });
    }
  });

  return router;
}
