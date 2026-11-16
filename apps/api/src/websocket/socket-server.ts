import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { socketRegistry } from './socket-registry';
import { generateUniqueAgentCode } from '../utils/code-generator';

const registerPayloadSchema = z.object({
  machineToken: z.string().min(1, 'machineToken é obrigatório'),
  hostname: z.string().optional(),
  os: z.string().optional(),
  version: z.string().optional(),
  defaultPrinter: z.string().optional(),
  printers: z.array(z.any()).optional().default([]),
});

const heartbeatPayloadSchema = z.object({
  machineToken: z.string().min(1, 'machineToken é obrigatório'),
  defaultPrinter: z.string().optional(),
  printers: z.array(z.any()).optional(),
  version: z.string().optional(),
  updateStatus: z.string().optional(),
  downloadProgress: z.number().optional(),
});

const setDefaultPrinterSchema = z.object({
  machineToken: z.string().min(1),
  defaultPrinter: z.string().min(1),
});

const unclaimSchema = z.object({
  machineToken: z.string().min(1),
});

const printStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['PRINTING', 'COMPLETED', 'FAILED']),
  errorMessage: z.string().optional(),
});

const agentRequestTestSchema = z.object({
  machineToken: z.string().min(1, 'machineToken é obrigatório'),
  printerName: z.string().optional(),
});

export function setupSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  socketRegistry.setIo(io);

  io.on('connection', async (socket: Socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    // 1. Checa autenticação de Admin (Painel Web)
    const adminToken = socket.handshake.auth?.token;
    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, env.JWT_SECRET) as { id: string };
        const admin = await prisma.adminUser.findUnique({
          where: { id: decoded.id },
          select: { id: true, email: true },
        });
        if (admin) {
          socket.join('admins');
        }
      } catch (err) {
        // Token inválido, prossegue como cliente não-admin
      }
    }

    // 2. Evento: agent:register
    socket.on('agent:register', async (rawData, ackCallback) => {
      try {
        const payload = registerPayloadSchema.parse(rawData);

        let agent = await prisma.agent.findUnique({
          where: { machineToken: payload.machineToken },
          include: { company: { select: { id: true, name: true } } },
        });

        if (!agent) {
          const code = await generateUniqueAgentCode(prisma);
          agent = await prisma.agent.create({
            data: {
              machineToken: payload.machineToken,
              code,
              status: 'ONLINE',
              lastSeenAt: new Date(),
              hostname: payload.hostname,
              os: payload.os,
              version: payload.version,
              ipAddress: String(clientIp),
              defaultPrinter: payload.defaultPrinter || null,
              printers: payload.printers || [],
            },
            include: { company: { select: { id: true, name: true } } },
          });
        } else {
          agent = await prisma.agent.update({
            where: { id: agent.id },
            data: {
              status: 'ONLINE',
              lastSeenAt: new Date(),
              hostname: payload.hostname ?? agent.hostname,
              os: payload.os ?? agent.os,
              version: payload.version ?? agent.version,
              ipAddress: String(clientIp),
              defaultPrinter: payload.defaultPrinter !== undefined ? payload.defaultPrinter : agent.defaultPrinter,
              printers: payload.printers !== undefined ? payload.printers : [],
            },
            include: { company: { select: { id: true, name: true } } },
          });
        }

        socketRegistry.registerAgentSocket(agent.id, payload.machineToken, socket);

        const responsePayload = {
          id: agent.id,
          code: agent.code,
          name: agent.name,
          company: agent.company ? { id: agent.company.id, name: agent.company.name } : null,
          defaultPrinter: agent.defaultPrinter,
        };

        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, agent: responsePayload });
        }
        socket.emit('agent:registered', responsePayload);

        // Notifica o painel administrativo em tempo real
        socketRegistry.broadcastToAdmins('dashboard:update', {
          type: 'agent_status',
          agent: {
            id: agent.id,
            code: agent.code,
            name: agent.name,
            status: 'ONLINE',
            lastSeenAt: agent.lastSeenAt,
            company: agent.company,
            defaultPrinter: agent.defaultPrinter,
            printers: agent.printers,
            hostname: agent.hostname,
            os: agent.os,
            version: agent.version,
          },
        });

        // 3. Fila de Resiliência: Despachar jobs pendentes (QUEUED) para este agente
        const pendingJobs = await prisma.printJob.findMany({
          where: {
            agentId: agent.id,
            status: 'QUEUED',
          },
          orderBy: { createdAt: 'asc' },
        });

        if (pendingJobs.length > 0) {
          console.log(`📦 Despachando ${pendingJobs.length} jobs pendentes para o agente ${agent.code}...`);
          for (const job of pendingJobs) {
            socket.emit('print:job', {
              jobId: job.id,
              title: job.title,
              printerName: job.printerName,
              type: job.type,
              content: job.content,
              options: job.options,
            });
          }
        }
      } catch (err: any) {
        console.error('Erro no processamento de agent:register:', err);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message || 'Erro ao registrar agente' });
        }
      }
    });

    // 3. Evento: agent:heartbeat
    socket.on('agent:heartbeat', async (rawData, ackCallback) => {
      try {
        const payload = heartbeatPayloadSchema.parse(rawData);

        const agent = await prisma.agent.findUnique({
          where: { machineToken: payload.machineToken },
        });

        if (agent) {
          socketRegistry.registerAgentSocket(agent.id, payload.machineToken, socket);

          const updated = await prisma.agent.update({
            where: { id: agent.id },
            data: {
              status: 'ONLINE',
              lastSeenAt: new Date(),
              ipAddress: String(clientIp),
              ...(payload.defaultPrinter !== undefined && { defaultPrinter: payload.defaultPrinter }),
              ...(payload.printers !== undefined && { printers: payload.printers }),
              ...(payload.version !== undefined && { version: payload.version }),
            },
            include: { company: { select: { id: true, name: true } } },
          });

          socketRegistry.broadcastToAdmins('dashboard:update', {
            type: 'agent_heartbeat',
            agent: {
              id: updated.id,
              code: updated.code,
              status: 'ONLINE',
              lastSeenAt: updated.lastSeenAt,
              defaultPrinter: updated.defaultPrinter,
              printers: updated.printers,
              version: updated.version,
              updateStatus: payload.updateStatus,
              downloadProgress: payload.downloadProgress,
            },
          });
        }

        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, receivedAt: new Date() });
        }
      } catch (err: any) {
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message });
        }
      }
    });

    // Evento: agent:update_status
    socket.on('agent:update_status', async (rawData) => {
      try {
        if (!rawData?.machineToken) return;
        const agent = await prisma.agent.findUnique({
          where: { machineToken: rawData.machineToken },
        });

        if (agent) {
          if (rawData.currentVersion && rawData.currentVersion !== agent.version) {
            await prisma.agent.update({
              where: { id: agent.id },
              data: { version: rawData.currentVersion },
            });
          }

          socketRegistry.broadcastToAdmins('dashboard:update', {
            type: 'agent_update_status',
            agentId: agent.id,
            updateStatus: rawData.status,
            currentVersion: rawData.currentVersion,
            availableVersion: rawData.availableVersion,
            downloadProgress: rawData.downloadProgress,
          });
        }
      } catch (err) {
        console.warn('Erro ao processar agent:update_status:', err);
      }
    });

    // 4. Evento: agent:set-default-printer
    socket.on('agent:set-default-printer', async (rawData, ackCallback) => {
      try {
        const payload = setDefaultPrinterSchema.parse(rawData);

        const agent = await prisma.agent.findUnique({
          where: { machineToken: payload.machineToken },
        });

        if (agent) {
          const updated = await prisma.agent.update({
            where: { id: agent.id },
            data: { defaultPrinter: payload.defaultPrinter },
          });

          socketRegistry.broadcastToAdmins('dashboard:update', {
            type: 'agent_printer_updated',
            agentId: updated.id,
            defaultPrinter: updated.defaultPrinter,
          });

          if (typeof ackCallback === 'function') {
            ackCallback({ success: true, defaultPrinter: updated.defaultPrinter });
          }
        } else {
          if (typeof ackCallback === 'function') {
            ackCallback({ success: false, error: 'Agente não encontrado' });
          }
        }
      } catch (err: any) {
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message });
        }
      }
    });

    // 5. Evento: agent:unclaim
    socket.on('agent:unclaim', async (rawData, ackCallback) => {
      try {
        const payload = unclaimSchema.parse(rawData);

        const agent = await prisma.agent.findUnique({
          where: { machineToken: payload.machineToken },
        });

        if (!agent) {
          if (typeof ackCallback === 'function') {
            ackCallback({ success: false, error: 'Agente não encontrado' });
          }
          return;
        }

        const newCode = await generateUniqueAgentCode(prisma);
        const updated = await prisma.agent.update({
          where: { id: agent.id },
          data: {
            companyId: null,
            code: newCode,
          },
        });

        const updatePayload = {
          code: updated.code,
          name: updated.name,
          company: null,
          defaultPrinter: updated.defaultPrinter,
        };

        socket.emit('agent:updated', updatePayload);

        socketRegistry.broadcastToAdmins('dashboard:update', {
          type: 'agent_unclaimed',
          agentId: updated.id,
          code: updated.code,
        });

        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, agent: updatePayload });
        }
      } catch (err: any) {
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message });
        }
      }
    });

    // 6. Evento: print:status
    socket.on('print:status', async (rawData, ackCallback) => {
      try {
        const payload = printStatusSchema.parse(rawData);

        const job = await prisma.printJob.findUnique({
          where: { id: payload.jobId },
        });

        if (!job) {
          if (typeof ackCallback === 'function') {
            ackCallback({ success: false, error: 'Job não encontrado' });
          }
          return;
        }

        // REGRA DE OURO (Fonte da Verdade): Se o job já atingiu um estado terminal (COMPLETED ou FAILED),
        // ignora qualquer status PRINTING atrasado recebido por concorrência de rede.
        if ((job.status === 'COMPLETED' || job.status === 'FAILED') && payload.status === 'PRINTING') {
          if (typeof ackCallback === 'function') {
            ackCallback({ success: true, status: job.status });
          }
          return;
        }

        const updatedJob = await prisma.printJob.update({
          where: { id: payload.jobId },
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

        socketRegistry.broadcastToAdmins('dashboard:update', {
          type: 'print_job_status',
          job: {
            id: updatedJob.id,
            status: updatedJob.status,
            startedAt: updatedJob.startedAt,
            completedAt: updatedJob.completedAt,
            errorMessage: updatedJob.errorMessage,
          },
        });

        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, status: updatedJob.status });
        }
      } catch (err: any) {
        console.error('Erro ao atualizar status do print job:', err);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message });
        }
      }
    });

    // 7. Evento: agent:request-test (disparo de teste direto pelo Desktop persistido no banco)
    socket.on('agent:request-test', async (rawData, ackCallback) => {
      try {
        const payload = agentRequestTestSchema.parse(rawData);

        const agent = await prisma.agent.findUnique({
          where: { machineToken: payload.machineToken },
          include: { company: true },
        });

        if (!agent) {
          if (typeof ackCallback === 'function') {
            ackCallback({ success: false, error: 'Agente não encontrado no Hub' });
          }
          return;
        }

        const targetPrinter = payload.printerName || agent.defaultPrinter || 'Padrão';
        const dateStr = new Date().toLocaleString('pt-BR');

        // Layout de cupom térmico padrão ESC/POS
        const textContent = [
          '--------------------------------',
          '        SILENTPRINT HUB         ',
          '    TESTE DE IMPRESSAO LOCAL    ',
          '--------------------------------',
          `Data/Hora: ${dateStr}`,
          `Terminal: ${agent.code}`,
          `Empresa: ${agent.company?.name || 'Não vinculada'}`,
          `Impressora: ${targetPrinter}`,
          '--------------------------------',
          'Comunicação bidirecional com a  ',
          'API e Banco de Dados: SUCESSO!  ',
          '--------------------------------',
          '',
        ].join('\n');

        // Cria o registro oficial no banco PostgreSQL
        const job = await prisma.printJob.create({
          data: {
            agentId: agent.id,
            companyId: agent.companyId,
            printerName: targetPrinter,
            title: `Teste Local (${agent.code})`,
            type: 'TEXT',
            content: textContent,
            options: { cut: true },
            status: 'QUEUED',
          },
        });

        // Notifica o painel administrativo em tempo real
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

        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            job: {
              jobId: job.id,
              title: job.title,
              printerName: job.printerName,
              type: job.type,
              content: job.content,
              options: job.options,
            },
          });
        }
      } catch (err: any) {
        console.error('Erro ao processar agent:request-test:', err);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message });
        }
      }
    });

    // 8. Evento: disconnect
    socket.on('disconnect', async () => {
      const agentId = socketRegistry.unregisterSocket(socket.id);
      if (agentId && !socketRegistry.isAgentOnline(agentId)) {
        await prisma.agent.update({
          where: { id: agentId },
          data: { status: 'OFFLINE' },
        }).catch(() => null);

        socketRegistry.broadcastToAdmins('dashboard:update', {
          type: 'agent_status',
          agent: {
            id: agentId,
            status: 'OFFLINE',
          },
        });
      }
    });
  });

  return io;
}
