import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authApiKey } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { socketRegistry } from '../../websocket/socket-registry';
import { generateUniqueAgentCode } from '../../utils/code-generator';
import { AuthenticatedCompanyRequest } from '../../types';
import { failActiveJobsOnRebind, withAgentLock } from '../../services/agent-jobs';

const router = Router();
router.use(authApiKey);

const claimSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'Código é obrigatório'),
    name: z.string().optional(),
  }),
});

const unclaimSchema = z.object({
  params: z.object({
    code: z.string().min(1),
  }),
});

const updateAgentSchema = z.object({
  params: z.object({
    code: z.string().min(1),
  }),
  body: z.object({
    name: z.string().optional(),
    defaultPrinter: z.string().optional(),
  }),
});

function sanitizeAgent(agent: any) {
  const { machineToken, ...safeAgent } = agent;
  return safeAgent;
}

// POST /api/v1/agents/claim
router.post('/claim', validate(claimSchema), async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const { code, name } = req.body;
    const company = req.company!;

    const agent = await prisma.agent.findUnique({
      where: { code },
    });

    if (!agent) {
      res.status(404).json({ error: 'Nenhum agente encontrado com o código fornecido' });
      return;
    }

    // Regra de segurança estrita de vínculo (revalidada sob lock: corrida com outro claim/unclaim)
    const updated = await withAgentLock(agent.id, async (tx) => {
      const fresh = await tx.agent.findUnique({ where: { id: agent.id } });
      if (!fresh || fresh.code !== code) return 'missing' as const;
      if (fresh.companyId && fresh.companyId !== company.id) return 'conflict' as const;
      if (fresh.companyId !== company.id) await failActiveJobsOnRebind(tx, fresh.id);
      return tx.agent.update({
        where: { id: fresh.id },
        data: { companyId: company.id, name: name || fresh.name },
      });
    });

    if (updated === 'missing') {
      res.status(404).json({ error: 'Nenhum agente encontrado com o código fornecido' });
      return;
    }
    if (updated === 'conflict') {
      res.status(409).json({
        error: 'Conflito: este agente já está vinculado a outra empresa. Solicite a desvinculação prévia.',
      });
      return;
    }

    // Notifica o agente conectado via Socket.IO
    socketRegistry.emitToAgent(updated.id, 'agent:updated', {
      code: updated.code,
      name: updated.name,
      company: { id: company.id, name: company.name },
      defaultPrinter: updated.defaultPrinter,
    });

    // Notifica administradores do HUB
    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'agent_claimed',
      agent: sanitizeAgent(updated),
    });

    res.json({
      message: 'Agente vinculado com sucesso',
      agent: sanitizeAgent(updated),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao vincular agente' });
  }
});

// POST /api/v1/agents/:code/unclaim
router.post('/:code/unclaim', validate(unclaimSchema), async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const code = req.params.code as string;
    const company = req.company!;

    const agent = await prisma.agent.findUnique({
      where: { code },
    });

    if (!agent || agent.companyId !== company.id) {
      res.status(404).json({ error: 'Agente não encontrado ou não pertence a esta empresa' });
      return;
    }

    const newCode = await generateUniqueAgentCode(prisma);

    const updated = await withAgentLock(agent.id, async (tx) => {
      const fresh = await tx.agent.findUnique({ where: { id: agent.id } });
      if (!fresh || fresh.companyId !== company.id) return null;
      await failActiveJobsOnRebind(tx, fresh.id);
      return tx.agent.update({ where: { id: fresh.id }, data: { companyId: null, code: newCode } });
    });

    if (!updated) {
      res.status(404).json({ error: 'Agente não encontrado ou não pertence a esta empresa' });
      return;
    }

    socketRegistry.emitToAgent(updated.id, 'agent:updated', {
      code: updated.code,
      name: updated.name,
      company: null,
      defaultPrinter: updated.defaultPrinter,
    });

    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'agent_unclaimed',
      agent: sanitizeAgent(updated),
    });

    res.json({
      message: 'Agente desvinculado com sucesso. Um novo código foi gerado.',
      newCode: updated.code,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao desvincular agente' });
  }
});

// GET /api/v1/agents
router.get('/', async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const company = req.company!;

    const agents = await prisma.agent.findMany({
      where: { companyId: company.id },
      orderBy: [{ code: 'asc' }],
    });

    res.json(agents.map(sanitizeAgent));
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar agentes' });
  }
});

// PATCH /api/v1/agents/:code
router.patch('/:code', validate(updateAgentSchema), async (req: AuthenticatedCompanyRequest, res: Response) => {
  try {
    const code = req.params.code as string;
    const { name, defaultPrinter } = req.body;
    const company = req.company!;

    const agent = await prisma.agent.findUnique({
      where: { code },
    });

    if (!agent || agent.companyId !== company.id) {
      res.status(404).json({ error: 'Agente não encontrado ou não pertence a esta empresa' });
      return;
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        ...(name !== undefined && { name }),
        ...(defaultPrinter !== undefined && { defaultPrinter }),
      },
    });

    socketRegistry.emitToAgent(updated.id, 'agent:updated', {
      code: updated.code,
      name: updated.name,
      company: { id: company.id, name: company.name },
      defaultPrinter: updated.defaultPrinter,
    });

    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'agent_updated',
      agent: sanitizeAgent(updated),
    });

    res.json(sanitizeAgent(updated));
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar configurações do agente' });
  }
});

export default router;
