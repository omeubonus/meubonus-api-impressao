import { Router, Response } from 'express';
import { prisma } from '../../config/prisma';
import { authAdmin } from '../../middlewares/auth';
import { AuthenticatedAdminRequest } from '../../types';

const router = Router();

router.get('/', authAdmin, async (_req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalCompanies,
      totalAgents,
      onlineAgents,
      unassignedAgents,
      totalJobs,
      jobsLast24h,
      queuedJobs,
      failedJobs,
      completedJobs,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.agent.count(),
      prisma.agent.count({ where: { status: 'ONLINE' } }),
      prisma.agent.count({ where: { companyId: null } }),
      prisma.printJob.count(),
      prisma.printJob.count({ where: { createdAt: { gte: oneDayAgo } } }),
      prisma.printJob.count({ where: { status: 'QUEUED' } }),
      prisma.printJob.count({ where: { status: 'FAILED' } }),
      prisma.printJob.count({ where: { status: 'COMPLETED' } }),
    ]);

    res.json({
      companies: {
        total: totalCompanies,
      },
      agents: {
        total: totalAgents,
        online: onlineAgents,
        offline: totalAgents - onlineAgents,
        unassigned: unassignedAgents,
      },
      jobs: {
        total: totalJobs,
        last24h: jobsLast24h,
        queued: queuedJobs,
        failed: failedJobs,
        completed: completedJobs,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao carregar estatísticas do dashboard' });
  }
});

export default router;
