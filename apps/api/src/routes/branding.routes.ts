import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

const router = Router();

export const BRANDING_SETTING_KEY = 'branding';

/**
 * GET /api/branding
 * Público: retorna o tema/identidade visual ativa do sistema (fonte da verdade para Web e Desktop)
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: BRANDING_SETTING_KEY },
    });

    res.json({
      branding: setting?.value ?? null,
      updatedAt: setting?.updatedAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
