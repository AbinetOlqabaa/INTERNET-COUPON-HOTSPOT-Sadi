import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AnalyticsService } from './service.js';
import type { AuthenticatedRequest } from '../auth/routes.js';

export function createAnalyticsRouter(
  analyticsService: AnalyticsService,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/overview', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const data = await analyticsService.getOverview(ownerId);
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'ANALYTICS_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/revenue', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const data = await analyticsService.getRevenueTimeSeries(ownerId);
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'REVENUE_ANALYTICS_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/usage', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const data = await analyticsService.getUsageMetrics(ownerId);
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'USAGE_ANALYTICS_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/retention', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const data = await analyticsService.getRetentionMetrics(ownerId);
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'RETENTION_ANALYTICS_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/export', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const type = req.query.type === 'sessions' ? 'sessions' : 'ledger';
      const csv = await analyticsService.exportCsv(ownerId, type);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hotspot-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'EXPORT_FAILED', message: (err as Error).message } });
    }
  });

  return router;
}
