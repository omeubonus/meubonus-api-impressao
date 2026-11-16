import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authAdmin } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { socketRegistry } from '../../websocket/socket-registry';
import { AuthenticatedAdminRequest } from '../../types';

const router = Router();
router.use(authAdmin);

const printTestSchema = z.object({
  body: z.object({
    agentId: z.string().uuid('ID do agente inválido'),
    printerName: z.string().optional(),
    type: z.enum(['TEXT', 'RAW', 'PDF', 'IMAGE', 'HTML']),
    content: z.string().min(1, 'Conteúdo de impressão é obrigatório'),
    title: z.string().optional().default('Teste do Painel Admin'),
    options: z.any().optional().default({}),
  }),
});

router.post('/', validate(printTestSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { agentId, printerName, type, content, title, options } = req.body;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }

    const resolvedPrinter = printerName || agent.defaultPrinter;

    // PostgreSQL text columns reject 0x00 (NUL byte).
    // Converte conteúdos que possuem bytes nulos (como comandos RAW ESC-POS binários) para Base64.
    let safeContent = content;
    if (typeof safeContent === 'string' && safeContent.includes('\0')) {
      safeContent = Buffer.from(safeContent, 'binary').toString('base64');
    }

    const job = await prisma.printJob.create({
      data: {
        agentId: agent.id,
        companyId: agent.companyId,
        printerName: resolvedPrinter,
        type,
        content: safeContent,
        title,
        options,
        status: 'QUEUED',
      },
    });

    const isDispatched = socketRegistry.emitToAgent(agent.id, 'print:job', {
      jobId: job.id,
      title: job.title,
      printerName: job.printerName,
      type: job.type,
      content: job.content,
      options: job.options,
    });

    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'new_print_job',
      job: {
        id: job.id,
        title: job.title,
        agentId: agent.id,
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
    console.error('Erro ao criar teste de impressão:', error);
    res.status(500).json({ error: 'Erro ao criar teste de impressão', message: error?.message });
  }
});

export default router;
