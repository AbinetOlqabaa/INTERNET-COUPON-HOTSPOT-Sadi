import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AIService } from './service.js';
import type { AuthenticatedRequest } from '../auth/routes.js';

const RegisterProviderSchema = z.object({
  provider: z.enum(['gemini', 'groq', 'ollama', 'openai_compatible']),
  model: z.string().min(1).max(64),
  type: z.enum(['hosted', 'local']).default('hosted'),
  endpoint: z.string().url().nullable().optional(),
  apiKey: z.string().max(256).nullable().optional(),
  capabilities: z.array(z.string()).optional(),
  isFreeTier: z.boolean().default(true),
  priority: z.number().int().default(1),
  monthlyBudgetCents: z.number().int().nonnegative().default(0),
});

const CopilotQuerySchema = z.object({
  question: z.string().min(1).max(500),
});

const SupportDraftSchema = z.object({
  customerIssue: z.string().min(1).max(1000),
  sessionStatus: z.string().optional(),
});

export function createAIRouter(
  aiService: AIService,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/providers', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const providers = await aiService.listProviders(ownerId);
      res.json({ providers });
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'AI_PROVIDERS_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/providers', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const parsed = RegisterProviderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid AI provider configuration', details: parsed.error.issues },
        });
        return;
      }
      const provider = await aiService.registerProvider(ownerId, parsed.data);
      res.status(201).json({ provider });
    } catch (err: unknown) {
      res.status(400).json({ error: { code: 'REGISTRATION_FAILED', message: (err as Error).message } });
    }
  });

  router.patch('/providers/:id', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const updated = await aiService.updateProvider(ownerId, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found.' } });
        return;
      }
      res.json({ provider: updated });
    } catch (err: unknown) {
      res.status(400).json({ error: { code: 'UPDATE_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/providers/:id/test', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const result = await aiService.testProvider(ownerId, req.params.id);
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: { code: 'TEST_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/copilot', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const parsed = CopilotQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Question is required', details: parsed.error.issues },
        });
        return;
      }
      const answer = await aiService.askCopilot(ownerId, parsed.data.question);
      res.json(answer);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'COPILOT_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/forecast', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const forecast = await aiService.getForecast(ownerId);
      res.json(forecast);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'FORECAST_FAILED', message: (err as Error).message } });
    }
  });

  router.get('/anomalies', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const anomalies = await aiService.getAnomalies(ownerId);
      res.json(anomalies);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'ANOMALIES_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/support-draft', async (req: Request, res) => {
    try {
      const ownerId = (req as AuthenticatedRequest).user?.id ?? (req as AuthenticatedRequest).ownerId;
      if (!ownerId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Owner context required.' } });
        return;
      }
      const parsed = SupportDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Customer issue text is required', details: parsed.error.issues },
        });
        return;
      }
      const draft = await aiService.draftSupportResponse(ownerId, parsed.data);
      res.json(draft);
    } catch (err: unknown) {
      res.status(500).json({ error: { code: 'DRAFT_FAILED', message: (err as Error).message } });
    }
  });

  return router;
}
