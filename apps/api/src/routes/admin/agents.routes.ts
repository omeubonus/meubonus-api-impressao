import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authAdmin } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { socketRegistry } from '../../websocket/socket-registry';
import { generateUniqueAgentCode } from '../../utils/code-generator';
import { AuthenticatedAdminRequest } from '../../types';
import { failActiveJobsOnRebind, withAgentLock } from '../../services/agent-jobs';
import { fetchLatestGitHubRelease } from '../downloads.routes';

const router = Router();
router.use(authAdmin);

const listAgentsQuerySchema = z.object({
  query: z.object({
    companyId: z.string().optional(),
    unassigned: z.string().optional(),
    status: z.enum(['ONLINE', 'OFFLINE']).optional(),
    search: z.string().optional(),
  }),
});

const assignAgentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    companyId: z.string().uuid('ID da empresa inválido'),
  }),
});

const unclaimAgentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

const updateAgentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().optional(),
    defaultPrinter: z.string().optional(),
  }),
});

// Sanitiza o agente removendo o machineToken secreto
function sanitizeAgent(agent: any) {
  const { machineToken, ...safeAgent } = agent;
  return safeAgent;
}

router.get('/', validate(listAgentsQuerySchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { companyId, unassigned, status, search } = req.query as any;

    const where: any = {};

    if (unassigned === 'true' || unassigned === '1') {
      where.companyId = null;
    } else if (companyId) {
      where.companyId = companyId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { hostname: { contains: search, mode: 'insensitive' } },
      ];
    }

    const agents = await prisma.agent.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      include: {
        company: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { jobs: true },
        },
      },
    });

    res.json(agents.map(sanitizeAgent));
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar agentes' });
  }
});

router.post('/:id/assign', validate(assignAgentSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { companyId } = req.body;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }

    const updated = await withAgentLock(id, async (tx) => {
      const fresh = await tx.agent.findUnique({ where: { id } });
      if (!fresh) return null;
      if (fresh.companyId !== companyId) await failActiveJobsOnRebind(tx, id);
      return tx.agent.update({
        where: { id },
        data: { companyId },
        include: { company: { select: { id: true, name: true, slug: true } } },
      });
    });
    if (!updated) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }

    // Notifica o agente via WebSocket
    socketRegistry.emitToAgent(updated.id, 'agent:updated', {
      code: updated.code,
      name: updated.name,
      company: { id: company.id, name: company.name },
      defaultPrinter: updated.defaultPrinter,
    });

    // Notifica administradores conectados
    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'agent_assigned',
      agent: sanitizeAgent(updated),
    });

    res.json(sanitizeAgent(updated));
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao vincular agente à empresa' });
  }
});

router.post('/:id/unclaim', validate(unclaimAgentSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }

    const newCode = await generateUniqueAgentCode(prisma);

    const updated = await withAgentLock(id, async (tx) => {
      const fresh = await tx.agent.findUnique({ where: { id } });
      if (fresh?.companyId) await failActiveJobsOnRebind(tx, id);
      return tx.agent.update({
        where: { id },
        data: { companyId: null, code: newCode },
        include: { company: { select: { id: true, name: true } } },
      });
    });

    // Notifica o agente via WebSocket
    socketRegistry.emitToAgent(updated.id, 'agent:updated', {
      code: updated.code,
      name: updated.name,
      company: null,
      defaultPrinter: updated.defaultPrinter,
    });

    // Notifica administradores
    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'agent_unclaimed',
      agent: sanitizeAgent(updated),
    });

    res.json({
      message: 'Agente desvinculado com sucesso e novo código gerado',
      agent: sanitizeAgent(updated),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao desvincular agente' });
  }
});

router.patch('/:id', validate(updateAgentSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, defaultPrinter } = req.body;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!agent) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(defaultPrinter !== undefined && { defaultPrinter }),
      },
      include: { company: { select: { id: true, name: true } } },
    });

    // Notifica o agente caso a impressora padrão tenha mudado
    socketRegistry.emitToAgent(updated.id, 'agent:updated', {
      code: updated.code,
      name: updated.name,
      company: updated.company ? { id: updated.company.id, name: updated.company.name } : null,
      defaultPrinter: updated.defaultPrinter,
    });

    socketRegistry.broadcastToAdmins('dashboard:update', {
      type: 'agent_updated',
      agent: sanitizeAgent(updated),
    });

    res.json(sanitizeAgent(updated));
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar agente' });
  }
});

function isVersionOutdated(agentVersion?: string | null, latestVersion?: string | null): boolean {
  if (!agentVersion || !latestVersion) return false;
  if (agentVersion.includes('dev')) return false;

  const clean = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [aMaj = 0, aMin = 0, aPatch = 0] = clean(agentVersion);
  const [lMaj = 0, lMin = 0, lPatch = 0] = clean(latestVersion);

  if (lMaj > aMaj) return true;
  if (lMaj === aMaj && lMin > aMin) return true;
  if (lMaj === aMaj && lMin === aMin && lPatch > aPatch) return true;
  return false;
}

router.post('/update-all', async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const force = req.body?.force === true;

    const ghRelease = await fetchLatestGitHubRelease();
    if (!ghRelease || (!ghRelease.winReady && !ghRelease.macReady)) {
      res.status(409).json({
        error: 'Os arquivos de instalação da última versão ainda estão sendo compilados. Aguarde a conclusão do build.',
      });
      return;
    }

    const latestVersion = ghRelease.version;

    const onlineAgents = await prisma.agent.findMany({
      where: { status: 'ONLINE' },
    });

    const outdatedAgents = onlineAgents.filter((agent) => {
      const osLower = (agent.os || '').toLowerCase();
      if (osLower.includes('darwin') || osLower.includes('mac')) {
        if (!ghRelease.macReady) return false;
      } else if (osLower.includes('win')) {
        if (!ghRelease.winReady) return false;
      }
      if (!agent.version) return true;
      return isVersionOutdated(agent.version, latestVersion);
    });

    let triggeredCount = 0;
    for (const agent of outdatedAgents) {
      const socket = socketRegistry.getSocketByAgentId(agent.id);
      if (socket && socket.connected) {
        socket.emit('agent:trigger_update', { force });
        triggeredCount++;
      }
    }

    res.json({
      success: true,
      latestVersion,
      totalOutdated: outdatedAgents.length,
      triggeredCount,
      message: `Comando de atualização enviado para ${triggeredCount} agente(s).`,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao disparar atualização em massa para os agentes' });
  }
});

router.post('/:id/update', async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const force = req.body?.force === true;

    const agent = await prisma.agent.findUnique({
      where: { id },
    });

    if (!agent) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }

    if (agent.status !== 'ONLINE') {
      res.status(400).json({ error: 'O agente precisa estar ONLINE para receber o comando de atualização.' });
      return;
    }

    const socket = socketRegistry.getSocketByAgentId(agent.id);
    if (!socket || !socket.connected) {
      res.status(400).json({ error: 'Conexão WebSocket ativa não encontrada para este agente no momento.' });
      return;
    }

    // Emite comando remoto com timeout de resposta
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(202).json({
          success: true,
          message: 'Comando de atualização emitido para o agente em segundo plano.',
        });
      }
    }, 4000);

    socket.emit('agent:trigger_update', { force }, (response: any) => {
      clearTimeout(timeout);
      if (!res.headersSent) {
        res.json(response || { success: true, message: 'Comando processado pelo agente.' });
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao disparar comando de atualização para o agente' });
  }
});

export default router;
