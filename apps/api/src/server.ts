import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { setupSocketServer } from './websocket/socket-server';
import { prisma } from './config/prisma';
import { bootstrapSystemDefaults } from './config/bootstrap';

const app = createApp();
const httpServer = http.createServer(app);

// Inicializa o servidor WebSocket (Socket.IO)
setupSocketServer(httpServer);

const PORT = env.PORT || 3333;

httpServer.listen(PORT, async () => {
  console.log(`
  🖨️  ======================================================
  🖨️  SilentPrint HUB Central (API & Socket.IO Server)
  🖨️  Porta:       ${PORT}
  🖨️  Ambiente:    ${env.NODE_ENV}
  🖨️  Healthcheck: http://localhost:${PORT}/health
  🖨️  ======================================================
  `);

  // Garante que o administrador e a empresa demo existam no banco
  await bootstrapSystemDefaults();
});

// Encerramento gracioso
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Recebido sinal ${signal}. Encerrando servidor graciosamente...`);
  httpServer.close(async () => {
    console.log('HTTP Server encerrado.');
    await prisma.$disconnect();
    console.log('Prisma desconectado.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ Forçando encerramento após timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
