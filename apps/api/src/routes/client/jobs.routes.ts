import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authApiKey } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { AuthenticatedCompanyRequest } from '../../types';

const router = Router();
router.use(authApiKey);

const listJobsSchema = z.object({
  query: z.object({
    agentCode: z.string().optional(),
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

router.get('/', validate(listJobsSchema), async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const { agentCode, status, page, limit } = req.query as any;
    const company = req.company!;

    const where: any = { companyId: company.id };
    if (status) where.status = status;
    if (agentCode) {
      where.agent = { code: agentCode };
    }

    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          printerName: true,
          title: true,
          type: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          agent: {
            select: {
              code: true,
              name: true,
            },
          },
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
    res.status(500).json({ error: 'Erro ao consultar histórico de impressões' });
  }
});

router.get('/:id', validate(jobParamSchema), async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const company = req.company!;

    const job = await prisma.printJob.findFirst({
      where: {
        id,
        companyId: company.id,
      },
      select: {
        id: true,
        printerName: true,
        title: true,
        type: true,
        content: true,
        options: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        agent: {
          select: {
            code: true,
            name: true,
            status: true,
            defaultPrinter: true,
          },
        },
      },
    });

    if (!job) {
      res.status(404).json({ error: 'Trabalho de impressão não encontrado' });
      return;
    }

    res.json(job);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao consultar detalhes do trabalho de impressão' });
  }
});

export default router;
