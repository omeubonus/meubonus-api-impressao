import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRandomCode(length = 6): string {
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `IMP-${result}`;
}

export async function generateUniqueAgentCode(prismaClient: PrismaClient): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const candidateCode = generateRandomCode(6);
    const existing = await prismaClient.agent.findUnique({
      where: { code: candidateCode },
      select: { id: true },
    });

    if (!existing) {
      return candidateCode;
    }
    attempts++;
  }

  // Fallback com timestamp em caso improvável de múltiplas colisões
  const fallbackSuffix = Date.now().toString(36).toUpperCase().slice(-6);
  return `IMP-${fallbackSuffix}`;
}

export function generateApiKey(): string {
  return `sp_live_${crypto.randomBytes(24).toString('hex')}`;
}
