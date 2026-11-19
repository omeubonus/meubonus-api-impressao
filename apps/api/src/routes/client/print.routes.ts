import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authApiKey } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { socketRegistry } from '../../websocket/socket-registry';
import { AuthenticatedCompanyRequest } from '../../types';
import { createJobForAgent } from '../../services/agent-jobs';

const router = Router();
router.use(authApiKey);

const printRequestSchema = z.object({
  body: z.object({
    agentCode: z.string().min(1, 'Código do agente é obrigatório'),
    printerName: z.string().optional(),
    type: z.enum(['TEXT', 'RAW', 'PDF', 'IMAGE', 'HTML']),
    content: z.string().min(1, 'Conteúdo é obrigatório'),
    title: z.string().optional().default('Trabalho de Impressão'),
    options: z.any().optional().default({}),
  }),
});

router.post('/', validate(printRequestSchema), async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const { agentCode, printerName, type, content, title, options } = req.body;
    const company = req.company!;

    const agent = await prisma.agent.findUnique({
      where: { code: agentCode },
    });

    if (!agent || agent.companyId !== company.id) {
      res.status(404).json({ error: 'Agente não encontrado ou não vinculado a esta empresa' });
      return;
    }

    const resolvedPrinter = printerName || agent.defaultPrinter || null;

    // PostgreSQL text columns reject 0x00 (NUL byte).
    // Converte conteúdos que possuem bytes nulos (como comandos RAW ESC-POS binários) para Base64.
    let safeContent = content;
    if (typeof safeContent === 'string' && safeContent.includes('\0')) {
      safeContent = Buffer.from(safeContent, 'binary').toString('base64');
    }

    // Criação + despacho atômicos em relação a claim/unclaim (empresa revalidada sob lock)
    const created = await createJobForAgent(agent.id, {
      expectedCompanyId: company.id,
      dispatch: true,
      data: () => ({ printerName: resolvedPrinter, type, content: safeContent, title, options }),
    });

    if (!created) {
      res.status(404).json({ error: 'Agente não encontrado ou não vinculado a esta empresa' });
      return;
    }
    const { job, dispatched: isDispatched } = created;

    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'new_print_job',
      job: {
        id: job.id,
        title: job.title,
        companyName: company.name,
        agentCode: agent.code,
        status: job.status,
        createdAt: job.createdAt,
      },
    });

    res.status(201).json({
      jobId: job.id,
      status: job.status,
      dispatchedImmediately: isDispatched,
      printerName: resolvedPrinter,
      createdAt: job.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao criar solicitação de impressão' });
  }
});

export default router;
