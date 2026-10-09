import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { LoyaltyService } from './service.js';
import type { AuthenticatedRequest } from '../auth/routes.js';

const GrantBonusBodySchema = z.object({
  customerId: z.string().uuid(),
  bonusType: z.enum(['free_minutes', 'discount_voucher']),
  amountUnits: z.number().int().positive(),
  budgetDeductionMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  expiresAt: z.string().datetime(),
  auditReason: z.string().min(1).max(256),
});

const AwardBadgeBodySchema = z.object({
  customerId: z.string().uuid(),
  badgeCode: z.enum(['EARLY_ADOPTER', 'LOYAL_STREAMER', 'WEEKEND_WARRIOR', 'COMMUNITY_REGULAR']),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export function createLoyaltyRouter(
  loyaltyService: LoyaltyService,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/segments', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const data = await loyaltyService.getSegmentsSummary(ownerId);
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'SEGMENTS_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/customers/:id', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const profile = await loyaltyService.getCustomerProfile(ownerId, req.params.id);
      res.json(profile);
    } catch (err: unknown) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
    }
  });

  router.post('/badges', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const parsed = AwardBadgeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid badge request', details: parsed.error.issues } });
        return;
      }
      const badge = await loyaltyService.awardBadge(
        ownerId,
        parsed.data.customerId,
        parsed.data.badgeCode,
        parsed.data.evidence
      );
      res.status(201).json({ badge });
    } catch (err: unknown) {
      res.status(400).json({ error: { code: 'BADGE_AWARD_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/bonuses', async (req: Request, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ownerId = authReq.user?.id ?? authReq.ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const parsed = GrantBonusBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid bonus request', details: parsed.error.issues } });
        return;
      }
      const actor = authReq.user?.displayName || authReq.user?.email || 'owner';
      const bonus = await loyaltyService.grantBonus(ownerId, {
        ...parsed.data,
        createdBy: actor,
      });
      res.status(201).json({ bonus });
    } catch (err: unknown) {
      res.status(400).json({ error: { code: 'BONUS_GRANT_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/bonuses/:id/claim', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const { customerId } = req.body;
      if (!customerId) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'customerId is required in body to claim.' } });
        return;
      }
      const updated = await loyaltyService.claimBonus(ownerId, req.params.id, customerId);
      res.json({ bonus: updated });
    } catch (err: unknown) {
      res.status(400).json({ error: { code: 'BONUS_CLAIM_FAILED', message: (err as Error).message } });
    }
  });

  return router;
}
