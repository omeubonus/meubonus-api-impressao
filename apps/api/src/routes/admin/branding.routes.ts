import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authAdmin } from '../../middlewares/auth';
import { AuthenticatedAdminRequest } from '../../types';
import { socketRegistry } from '../../websocket/socket-registry';
import { BRANDING_SETTING_KEY } from '../branding.routes';

const router = Router();

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Cor hexadecimal inválida');

const brandingSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  badge: z.string().max(24).default(''),
  subtitle: z.string().max(160).default(''),
  loginTitle: z.string().max(120).default('Acesso Administrativo'),
  loginSubtitle: z.string().max(240).default(''),
  downloadHeadline: z.string().max(160).default(''),
  downloadDescription: z.string().max(500).default(''),
  logoUrl: z.string().max(1_500_000).nullable().default(null),
  faviconUrl: z.string().max(1_500_000).nullable().default(null),
  showLogoText: z.boolean().default(true),
  colors: z.object({
    canvas950: hexColorSchema,
    canvas900: hexColorSchema,
    canvas850: hexColorSchema,
    surfaceCard: hexColorSchema,
    surfaceCardHover: hexColorSchema,
    surfaceSubtle: hexColorSchema,
    surfaceBorder: hexColorSchema,
    surfaceBorderSubtle: hexColorSchema,
    surfaceMuted: hexColorSchema,
    accent400: hexColorSchema,
    accent500: hexColorSchema,
    accent600: hexColorSchema,
    accent700: hexColorSchema,
    onAccent: hexColorSchema,
  }),
});

/**
 * PUT /api/admin/branding
 * Salva a identidade visual ativa no PostgreSQL e transmite em tempo real para todos os clientes Web e Agentes Desktop.
 */
router.put('/', authAdmin, async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = brandingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Configuração de marca inválida',
        details: parsed.error.flatten(),
      });
      return;
    }

    const branding = parsed.data;
    const saved = await prisma.systemSetting.upsert({
      where: { key: BRANDING_SETTING_KEY },
      update: { value: branding as unknown as Prisma.InputJsonValue },
      create: {
        key: BRANDING_SETTING_KEY,
        value: branding as unknown as Prisma.InputJsonValue,
      },
    });

    const io = socketRegistry.getIo();
    if (io) {
      io.emit('branding:updated', branding);
    }

    res.json({
      branding: saved.value,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/branding
 * Restaura o padrão de fábrica removendo o override salvo no banco.
 */
router.delete('/', authAdmin, async (_req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.systemSetting.deleteMany({
      where: { key: BRANDING_SETTING_KEY },
    });

    const io = socketRegistry.getIo();
    if (io) {
      io.emit('branding:updated', null);
    }

    res.json({ branding: null });
  } catch (err) {
    next(err);
  }
});

export default router;
