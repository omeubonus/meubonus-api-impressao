import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authAdmin } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { AuthenticatedAdminRequest } from '../../types';

const router = Router();
router.use(authAdmin);

const listJobsQuerySchema = z.object({
  query: z.object({
    companyId: z.string().optional(),
    agentId: z.string().optional(),
    status: z.enum(['QUEUED', 'PRINTING', 'COMPLETED', 'FAILED']).optional(),
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
  }),
});

const jobParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

router.get('/', validate(listJobsQuerySchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { companyId, agentId, status, page, limit } = req.query as any;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;

    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          company: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true, hostname: true } },
        },
      }),
      prisma.printJob.count({ where }),
    ]);

    res.json({
      data: jobs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar histórico de impressões' });
  }
});

router.get('/:id', validate(jobParamSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const job = await prisma.printJob.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        agent: { select: { id: true, code: true, name: true, defaultPrinter: true } },
      },
    });

    if (!job) {
      res.status(404).json({ error: 'Trabalho de impressão não encontrado' });
      return;
    }

    res.json(job);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao obter detalhes do trabalho de impressão' });
  }
});

export default router;
