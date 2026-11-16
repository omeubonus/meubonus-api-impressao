import express, { Express } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middlewares/error-handler';

// Rotas
import healthRoutes from './routes/health.routes';
import adminAuthRoutes from './routes/admin/auth.routes';
import adminStatsRoutes from './routes/admin/stats.routes';
import adminCompaniesRoutes from './routes/admin/companies.routes';
import adminAgentsRoutes from './routes/admin/agents.routes';
import adminJobsRoutes from './routes/admin/jobs.routes';
import adminPrintTestRoutes from './routes/admin/print-test.routes';
import adminBrandingRoutes from './routes/admin/branding.routes';
import brandingRoutes from './routes/branding.routes';

import clientAgentsRoutes from './routes/client/agents.routes';
import clientPrintRoutes from './routes/client/print.routes';
import clientJobsRoutes from './routes/client/jobs.routes';
import downloadsRoutes from './routes/downloads.routes';

export function createApp(): Express {
  const app = express();

  // CORS
  const allowedOrigins = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',');
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    })
  );

  // Body parsers com limite expandido para documentos Base64/PDFs
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Healthcheck (raiz /health para Traefik e Coolify)
  app.use('/', healthRoutes);

  // Downloads públicos do Agente Desktop (/api/downloads/*)
  app.use('/api/downloads', downloadsRoutes);

  // Branding público (fonte da verdade para Login, Download e Agente Desktop)
  app.use('/api/branding', brandingRoutes);

  // Rotas do Painel Administrativo (/api/admin/*)
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/stats', adminStatsRoutes);
  app.use('/api/admin/companies', adminCompaniesRoutes);
  app.use('/api/admin/agents', adminAgentsRoutes);
  app.use('/api/admin/jobs', adminJobsRoutes);
  app.use('/api/admin/print-test', adminPrintTestRoutes);
  app.use('/api/admin/branding', adminBrandingRoutes);

  // Rotas para Sistemas Clientes (/api/v1/* com x-api-key)
  app.use('/api/v1/agents', clientAgentsRoutes);
  app.use('/api/v1/print', clientPrintRoutes);
  app.use('/api/v1/jobs', clientJobsRoutes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  // Centralized Error handler
  app.use(errorHandler);

  return app;
}
