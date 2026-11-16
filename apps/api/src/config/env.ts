import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3333'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter no mínimo 16 caracteres').default('dev-silentprint-super-secret-jwt-token-key-32chars'),
  ADMIN_EMAIL: z.string().email().default('admin@silentprint.local'),
  ADMIN_PASSWORD: z.string().min(6).default('Admin@123456'),
  CORS_ORIGIN: z.string().default('*'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Configuração inválida de variáveis de ambiente:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
