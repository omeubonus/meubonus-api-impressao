import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import packageJson from '../../package.json';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Validação ativa de conexão com PostgreSQL 18
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ok',
      version: packageJson.version,
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      version: packageJson.version,
      database: 'disconnected',
      error: error.message || 'Falha na conexão com o banco de dados',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
