import type { Prisma, PrintJob, Agent } from '@prisma/client';
import { prisma } from '../config/prisma';
import { socketRegistry } from '../websocket/socket-registry';

export type Tx = Prisma.TransactionClient;

export const REBIND_ERROR_MESSAGE = 'Agente desvinculado da empresa antes da conclusão da impressão';

/**
 * Serializa toda mudança de vínculo, despacho e status de um agente: o lock de linha
 * (SELECT ... FOR UPDATE) faz com que a verificação de empresa e a ação (emit/update)
 * sejam atômicas em relação a claim/unclaim/assign.
 */
export async function withAgentLock<T>(agentId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM agents WHERE id = ${agentId} FOR UPDATE`;
      return fn(tx);
    },
    { timeout: 15000 }
  );
}

/**
 * Chamar dentro de withAgentLock quando o companyId do agente muda. Jobs ainda ativos pertencem ao
 * vínculo anterior e nunca podem ser entregues ao novo: ficam como FAILED (histórico preservado).
 */
export async function failActiveJobsOnRebind(tx: Tx, agentId: string): Promise<number> {
  const { count } = await tx.printJob.updateMany({
    where: { agentId, status: { in: ['QUEUED', 'PRINTING'] } },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage: REBIND_ERROR_MESSAGE },
  });
  return count;
}

export function toPrintJobPayload(job: PrintJob) {
  return {
    jobId: job.id,
    title: job.title,
    printerName: job.printerName,
    type: job.type,
    content: job.content,
    options: job.options,
  };
}

/**
 * Cria o job com a empresa VIGENTE do agente (lida sob lock) e, se pedido, emite `print:job`
 * ainda sob o lock. `expectedCompanyId` (rota do cliente) impede criar job para agente que
 * deixou de pertencer à empresa entre a checagem da rota e a criação.
 * Retorna null quando o agente não existe mais ou o vínculo não confere.
 */
export async function createJobForAgent(
  agentId: string,
  opts: {
    expectedCompanyId?: string;
    dispatch: boolean;
    data: (agent: Agent) => Omit<Prisma.PrintJobUncheckedCreateInput, 'agentId' | 'companyId' | 'status'>;
  }
): Promise<{ job: PrintJob; agent: Agent; dispatched: boolean } | null> {
  return withAgentLock(agentId, async (tx) => {
    const agent = await tx.agent.findUnique({ where: { id: agentId } });
    if (!agent) return null;
    if (opts.expectedCompanyId !== undefined && agent.companyId !== opts.expectedCompanyId) return null;

    const job = await tx.printJob.create({
      data: { ...opts.data(agent), agentId: agent.id, companyId: agent.companyId, status: 'QUEUED' },
    });
    const dispatched = opts.dispatch ? socketRegistry.emitToAgent(agent.id, 'print:job', toPrintJobPayload(job)) : false;
    return { job, agent, dispatched };
  });
}

/** Fila de resiliência: só jobs QUEUED da empresa vigente, e só para o socket ativo do agente. */
export async function dispatchQueuedJobs(agentId: string, socket: { id: string; emit: (e: string, p: unknown) => unknown }): Promise<number> {
  return withAgentLock(agentId, async (tx) => {
    const agent = await tx.agent.findUnique({ where: { id: agentId } });
    if (!agent || socketRegistry.getActiveAgentId(socket.id) !== agentId) return 0;

    const jobs = await tx.printJob.findMany({
      where: { agentId, status: 'QUEUED', companyId: agent.companyId },
      orderBy: { createdAt: 'asc' },
    });
    for (const job of jobs) socket.emit('print:job', toPrintJobPayload(job));
    return jobs.length;
  });
}

export type PrintStatusResult =
  | { ok: true; job: PrintJob }
  | { ok: false; error: string };

/**
 * Atualiza status somente se o socket for o ativo do agente dono do job E o job pertencer à
 * empresa vigente do agente, verificado sob lock e repetido no WHERE do UPDATE.
 */
export async function applyPrintStatus(
  socketId: string,
  payload: { jobId: string; status: 'PRINTING' | 'COMPLETED' | 'FAILED'; errorMessage?: string }
): Promise<PrintStatusResult> {
  const agentId = socketRegistry.getActiveAgentId(socketId);
  if (!agentId) return { ok: false, error: 'Socket não registrado como agente ativo' };

  return withAgentLock(agentId, async (tx): Promise<PrintStatusResult> => {
    const denied = { ok: false, error: 'Job não encontrado' } as const;
    // revalida sob lock: o socket pode ter sido substituído enquanto aguardava
    if (socketRegistry.getActiveAgentId(socketId) !== agentId) return denied;

    const agent = await tx.agent.findUnique({ where: { id: agentId } });
    if (!agent) return denied;

    const job = await tx.printJob.findUnique({ where: { id: payload.jobId } });
    if (!job || job.agentId !== agent.id || job.companyId !== agent.companyId) return denied;

    // Fonte da verdade: estado terminal ignora PRINTING atrasado.
    if ((job.status === 'COMPLETED' || job.status === 'FAILED') && payload.status === 'PRINTING') {
      return { ok: true, job };
    }

    const { count } = await tx.printJob.updateMany({
      where: { id: job.id, agentId: agent.id, companyId: agent.companyId },
      data: {
        status: payload.status,
        ...(payload.status === 'PRINTING' && !job.startedAt && { startedAt: new Date() }),
        ...(payload.status === 'COMPLETED' && { completedAt: new Date() }),
        ...(payload.status === 'FAILED' && {
          completedAt: new Date(),
          errorMessage: payload.errorMessage || 'Falha na execução do trabalho de impressão',
        }),
      },
    });
    if (count !== 1) return denied;
    return { ok: true, job: await tx.printJob.findUniqueOrThrow({ where: { id: job.id } }) };
  });
}
