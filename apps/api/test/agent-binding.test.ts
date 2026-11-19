/**
 * Testes de integração (Postgres real + Socket.IO real) para:
 *  - vazamento de jobs QUEUED entre empresas após troca de vínculo do agente;
 *  - falsificação de `print:status` (socket não registrado/antigo/de outro agente);
 *  - corridas entre mudança de vínculo, despacho e status.
 *
 * Exige um banco DESCARTÁVEL: DATABASE_URL deve apontar para um banco cujo nome termina em `_test`.
 * Os conteúdos usados são marcadores sintéticos (nenhum PDF/API key/machineToken real é logado).
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { randomBytes, randomUUID } from 'crypto';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const dbUrl = process.env.DATABASE_URL || '';
if (!/\/[^/?]*_test(\?|$)/.test(dbUrl)) {
  throw new Error('Recusando rodar: DATABASE_URL deve apontar para um banco descartável terminando em "_test".');
}
process.env.NODE_ENV = 'test';

type Prisma = typeof import('../src/config/prisma').prisma;

let prisma: Prisma;
let server: http.Server;
let baseUrl: string;
let adminToken: string;
const sockets: ClientSocket[] = [];

interface Company {
  id: string;
  name: string;
  apiKey: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, path: string, opts: { key?: string; admin?: boolean; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.key) headers['x-api-key'] = opts.key;
  if (opts.admin) headers.authorization = `Bearer ${adminToken}`;
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* corpo vazio */
  }
  return { status: res.status, json };
}

async function makeCompany(label: string): Promise<Company> {
  const suffix = randomBytes(4).toString('hex');
  const c = await prisma.company.create({
    data: { name: `Empresa ${label}`, slug: `${label.toLowerCase()}-${suffix}`, apiKey: `sp_live_${randomBytes(16).toString('hex')}` },
  });
  return { id: c.id, name: c.name, apiKey: c.apiKey };
}

async function makeAgent(companyId: string | null) {
  return prisma.agent.create({
    data: { machineToken: `mt-${randomUUID()}`, code: `T${randomBytes(3).toString('hex').toUpperCase()}`, companyId },
  });
}

class AgentClient {
  socket: ClientSocket;
  received: any[] = [];
  constructor(public machineToken: string) {
    this.socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(this.socket);
    this.socket.on('print:job', (j) => this.received.push(j));
  }
  async connect() {
    if (!this.socket.connected) await new Promise<void>((res, rej) => {
      this.socket.once('connect', () => res());
      this.socket.once('connect_error', rej);
    });
    return this;
  }
  async register() {
    await this.connect();
    const ack = await this.socket.timeout(5000).emitWithAck('agent:register', { machineToken: this.machineToken });
    await sleep(150); // dá tempo da fila de resiliência ser despachada
    return ack;
  }
  async status(jobId: string, status: 'PRINTING' | 'COMPLETED' | 'FAILED', errorMessage?: string) {
    await this.connect();
    return this.socket.timeout(5000).emitWithAck('print:status', { jobId, status, errorMessage });
  }
  async disconnect() {
    if (this.socket.connected) {
      const closed = new Promise<void>((r) => this.socket.once('disconnect', () => r()));
      this.socket.disconnect();
      await closed;
    }
    await sleep(100);
  }
  contents() {
    return this.received.map((j) => j.content);
  }
}

async function queueJob(companyId: string, agentId: string, content: string, status: 'QUEUED' | 'PRINTING' = 'QUEUED') {
  return prisma.printJob.create({ data: { companyId, agentId, content, type: 'PDF', title: 'job', status } });
}

/** Desvincula pela rota do cliente e vincula à empresa destino (fluxo A -> B). */
async function moveViaClientRoutes(agentCode: string, from: Company, to: Company) {
  const un = await api('POST', `/api/v1/agents/${agentCode}/unclaim`, { key: from.apiKey });
  assert.equal(un.status, 200);
  const claim = await api('POST', '/api/v1/agents/claim', { key: to.apiKey, body: { code: un.json.newCode } });
  assert.equal(claim.status, 200);
  return un.json.newCode as string;
}

before(async () => {
  const { prisma: p } = await import('../src/config/prisma');
  const { createApp } = await import('../src/app');
  const { setupSocketServer } = await import('../src/websocket/socket-server');
  prisma = p;
  server = http.createServer(createApp());
  setupSocketServer(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  const admin = await prisma.adminUser.create({
    data: { email: `admin-${randomBytes(4).toString('hex')}@test.local`, passwordHash: 'x', name: 'Admin Teste' },
  });
  const { env } = await import('../src/config/env');
  adminToken = jwt.sign({ id: admin.id, email: admin.email }, env.JWT_SECRET);
});

after(async () => {
  for (const s of sockets) s.close();
  await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.printJob.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.company.deleteMany();
});

describe('vazamento de jobs QUEUED entre empresas', () => {
  const routes: Array<[string, (agentId: string, code: string, from: Company, to: Company) => Promise<void>]> = [
    ['rotas do cliente (unclaim A + claim B)', async (_id, code, from, to) => void (await moveViaClientRoutes(code, from, to))],
    [
      'rotas administrativas (unclaim + assign B)',
      async (id, _code, _from, to) => {
        assert.equal((await api('POST', `/api/admin/agents/${id}/unclaim`, { admin: true })).status, 200);
        assert.equal((await api('POST', `/api/admin/agents/${id}/assign`, { admin: true, body: { companyId: to.id } })).status, 200);
      },
    ],
    [
      'admin assign direto A -> B (sem unclaim)',
      async (id, _code, _from, to) => {
        assert.equal((await api('POST', `/api/admin/agents/${id}/assign`, { admin: true, body: { companyId: to.id } })).status, 200);
      },
    ],
    [
      'evento WebSocket agent:unclaim + claim B',
      async (_id, _code, _from, to) => {
        // o agente (com o socket antigo) se desvincula sozinho
        const agent = await prisma.agent.findFirstOrThrow({ where: { id: _id } });
        const c = await new AgentClient(agent.machineToken).connect();
        const ack = await c.socket.timeout(5000).emitWithAck('agent:unclaim', { machineToken: agent.machineToken });
        assert.equal(ack.success, true);
        await c.disconnect();
        const fresh = await prisma.agent.findFirstOrThrow({ where: { id: _id } });
        assert.equal((await api('POST', '/api/v1/agents/claim', { key: to.apiKey, body: { code: fresh.code } })).status, 200);
      },
    ],
  ];

  for (const [name, move] of routes) {
    it(`não envia conteúdo de A ao reconectar após ${name}; jobs de B imprimem; histórico preservado`, async () => {
      const A = await makeCompany('A');
      const B = await makeCompany('B');
      const agent = await makeAgent(A.id);
      const jobA = await queueJob(A.id, agent.id, 'CONTEUDO-SECRETO-DE-A');

      await move(agent.id, agent.code, A, B);

      // job de B criado enquanto o agente está offline entra na fila e deve imprimir
      const created = await api('POST', '/api/v1/print', {
        key: B.apiKey,
        body: { agentCode: (await prisma.agent.findFirstOrThrow({ where: { id: agent.id } })).code, type: 'TEXT', content: 'CONTEUDO-DE-B' },
      });
      assert.equal(created.status, 201);

      const client = new AgentClient(agent.machineToken);
      await client.register();
      assert.deepEqual(client.contents(), ['CONTEUDO-DE-B']);

      // impressão normal de B continua funcionando ao vivo
      const live = await api('POST', '/api/v1/print', {
        key: B.apiKey,
        body: { agentCode: (await prisma.agent.findFirstOrThrow({ where: { id: agent.id } })).code, type: 'TEXT', content: 'CONTEUDO-DE-B-2' },
      });
      assert.equal(live.status, 201);
      await sleep(150);
      assert.deepEqual(client.contents(), ['CONTEUDO-DE-B', 'CONTEUDO-DE-B-2']);

      // histórico de A preservado (não apagado), mas fora da fila
      const kept = await prisma.printJob.findUniqueOrThrow({ where: { id: jobA.id } });
      assert.equal(kept.content, 'CONTEUDO-SECRETO-DE-A');
      assert.equal(kept.companyId, A.id);
      assert.notEqual(kept.status, 'QUEUED');
    });
  }

  it('job PRINTING de A também sai de circulação ao trocar de empresa', async () => {
    const A = await makeCompany('A');
    const B = await makeCompany('B');
    const agent = await makeAgent(A.id);
    const job = await queueJob(A.id, agent.id, 'EM-IMPRESSAO-A', 'PRINTING');
    await moveViaClientRoutes(agent.code, A, B);
    assert.equal((await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'FAILED');
  });

  it('teste administrativo e teste do desktop usam a empresa vigente e não vazam após troca', async () => {
    const A = await makeCompany('A');
    const B = await makeCompany('B');
    const agent = await makeAgent(A.id);
    const client = await new AgentClient(agent.machineToken);
    await client.register();

    // teste administrativo (print:job ao vivo) ainda funciona para o vínculo vigente
    const t = await api('POST', '/api/admin/print-test', { admin: true, body: { agentId: agent.id, type: 'TEXT', content: 'TESTE-ADMIN' } });
    assert.equal(t.status, 201);
    await sleep(150);
    assert.deepEqual(client.contents(), ['TESTE-ADMIN']);
    const testJob = await prisma.printJob.findUniqueOrThrow({ where: { id: t.json.jobId } });
    assert.equal(testJob.companyId, A.id);

    // teste solicitado pelo desktop fica atrelado a A
    const ack = await client.socket.timeout(5000).emitWithAck('agent:request-test', { machineToken: agent.machineToken });
    assert.equal(ack.success, true);
    assert.equal((await prisma.printJob.findUniqueOrThrow({ where: { id: ack.job.jobId } })).companyId, A.id);

    await client.disconnect();
    await moveViaClientRoutes(agent.code, A, B);

    const again = new AgentClient(agent.machineToken);
    await again.register();
    assert.deepEqual(again.contents(), []);
  });
});

describe('print:status forjado', () => {
  async function setup() {
    const A = await makeCompany('A');
    const B = await makeCompany('B');
    const agentA = await makeAgent(A.id);
    const agentB = await makeAgent(B.id);
    const jobA = await queueJob(A.id, agentA.id, 'CONTEUDO-DE-A');
    return { A, B, agentA, agentB, jobA };
  }

  it('agente ativo dono do job consegue atualizar (controle positivo) e terminal não regride', async () => {
    const { agentA, jobA } = await setup();
    const a = new AgentClient(agentA.machineToken);
    await a.register();
    assert.equal((await a.status(jobA.id, 'PRINTING')).success, true);
    assert.equal((await a.status(jobA.id, 'COMPLETED')).success, true);
    const late = await a.status(jobA.id, 'PRINTING');
    assert.equal(late.success, true);
    assert.equal(late.status, 'COMPLETED');
    assert.equal((await prisma.printJob.findUniqueOrThrow({ where: { id: jobA.id } })).status, 'COMPLETED');
  });

  it('agente B não altera job de A', async () => {
    const { agentA, agentB, jobA } = await setup();
    const a = new AgentClient(agentA.machineToken);
    await a.register();
    const b = new AgentClient(agentB.machineToken);
    await b.register();
    const ack = await b.status(jobA.id, 'COMPLETED');
    assert.equal(ack.success, false);
    assert.equal((await prisma.printJob.findUniqueOrThrow({ where: { id: jobA.id } })).status, 'QUEUED');
  });

  it('socket não registrado não altera job', async () => {
    const { jobA } = await setup();
    const anon = new AgentClient('mt-desconhecido');
    const ack = await anon.status(jobA.id, 'FAILED', 'forjado');
    assert.equal(ack.success, false);
    const row = await prisma.printJob.findUniqueOrThrow({ where: { id: jobA.id } });
    assert.equal(row.status, 'QUEUED');
    assert.equal(row.errorMessage, null);
  });

  it('socket substituído (antigo) do próprio agente não altera job', async () => {
    const { agentA, jobA } = await setup();
    const oldSock = new AgentClient(agentA.machineToken);
    await oldSock.register();
    const newSock = new AgentClient(agentA.machineToken);
    await newSock.register();
    const ack = await oldSock.status(jobA.id, 'COMPLETED');
    assert.equal(ack.success, false);
    assert.equal((await prisma.printJob.findUniqueOrThrow({ where: { id: jobA.id } })).status, 'QUEUED');
    assert.equal((await newSock.status(jobA.id, 'PRINTING')).success, true);
  });

  it('agente desvinculado de A não atualiza job antigo de A depois de ir para B', async () => {
    const { A, B, agentA, jobA } = await setup();
    const a = new AgentClient(agentA.machineToken);
    await a.register();
    await moveViaClientRoutes(agentA.code, A, B);
    const ack = await a.status(jobA.id, 'COMPLETED');
    assert.equal(ack.success, false);
    assert.notEqual((await prisma.printJob.findUniqueOrThrow({ where: { id: jobA.id } })).status, 'COMPLETED');
  });
});

describe('corridas', () => {
  it('troca de vínculo concorrente com despacho (register) nunca deixa job de A elegível para B', async () => {
    for (let i = 0; i < 15; i++) {
      const A = await makeCompany('A');
      const B = await makeCompany('B');
      const agent = await makeAgent(A.id);
      const job = await queueJob(A.id, agent.id, `CONTEUDO-SECRETO-DE-A-${i}`);
      const client = new AgentClient(agent.machineToken);
      await client.connect();

      const move = (async () => {
        await sleep(Math.floor(Math.random() * 15));
        await moveViaClientRoutes(agent.code, A, B);
      })();
      const reg = (async () => {
        await sleep(Math.floor(Math.random() * 15));
        await client.socket.timeout(5000).emitWithAck('agent:register', { machineToken: agent.machineToken });
      })();
      await Promise.all([move, reg]);
      await sleep(100);

      // estado final: agente em B e job de A fora da fila
      const row = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.notEqual(row.status, 'QUEUED', `iteração ${i}: job de A continuou QUEUED`);
      await client.disconnect();

      // reconexão posterior jamais recebe A
      const again = new AgentClient(agent.machineToken);
      await again.register();
      assert.deepEqual(again.contents(), [], `iteração ${i}: reconexão recebeu conteúdo de A`);
      await again.disconnect();
      await prisma.printJob.deleteMany();
      await prisma.agent.deleteMany();
      await prisma.company.deleteMany();
    }
  });

  it('criação de job de A concorrente com troca para B nunca deixa job QUEUED de empresa diferente da vigente', async () => {
    for (let i = 0; i < 15; i++) {
      const A = await makeCompany('A');
      const B = await makeCompany('B');
      const agent = await makeAgent(A.id);
      const move = (async () => {
        await sleep(Math.floor(Math.random() * 10));
        await moveViaClientRoutes(agent.code, A, B);
      })();
      const print = api('POST', '/api/v1/print', {
        key: A.apiKey,
        body: { agentCode: agent.code, type: 'TEXT', content: `SECRETO-A-${i}` },
      });
      await Promise.all([move, print]);

      const final = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
      const jobs = await prisma.printJob.findMany({ where: { agentId: agent.id, status: 'QUEUED' } });
      for (const j of jobs) assert.equal(j.companyId, final.companyId, `iteração ${i}: job QUEUED de outra empresa`);
      await prisma.printJob.deleteMany();
      await prisma.agent.deleteMany();
      await prisma.company.deleteMany();
    }
  });

  it('status concorrente com troca de vínculo não deixa job de A em estado não terminal nem atualizado após a troca', async () => {
    for (let i = 0; i < 15; i++) {
      const A = await makeCompany('A');
      const B = await makeCompany('B');
      const agent = await makeAgent(A.id);
      const job = await queueJob(A.id, agent.id, `CONTEUDO-DE-A-${i}`);
      const client = new AgentClient(agent.machineToken);
      await client.register();

      const move = (async () => {
        await sleep(Math.floor(Math.random() * 10));
        await moveViaClientRoutes(agent.code, A, B);
      })();
      const st = (async () => {
        await sleep(Math.floor(Math.random() * 10));
        await client.status(job.id, 'PRINTING');
      })();
      await Promise.all([move, st]);
      await sleep(50);

      const row = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(row.status, 'FAILED', `iteração ${i}: job de A ficou ${row.status}`);

      // depois da troca, nenhuma atualização é aceita
      const ack = await client.status(job.id, 'COMPLETED');
      assert.equal(ack.success, false);
      assert.equal((await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'FAILED');
      await client.disconnect();
      await prisma.printJob.deleteMany();
      await prisma.agent.deleteMany();
      await prisma.company.deleteMany();
    }
  });
});
