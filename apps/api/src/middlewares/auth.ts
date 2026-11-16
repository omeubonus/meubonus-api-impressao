import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { AuthenticatedAdminRequest, AuthenticatedCompanyRequest, AdminPayload } from '../types';

export async function authAdmin(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticação não fornecido' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as AdminPayload;

    const admin = await prisma.adminUser.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true },
    });

    if (!admin) {
      res.status(401).json({ error: 'Usuário administrador não encontrado ou revogado' });
      return;
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export async function authApiKey(
  req: AuthenticatedCompanyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer sp_live_')) {
        apiKey = authHeader.substring(7);
      }
    }

    if (!apiKey) {
      res.status(401).json({ error: 'API Key não fornecida no cabeçalho x-api-key' });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { apiKey },
    });

    if (!company) {
      res.status(401).json({ error: 'API Key inválida' });
      return;
    }

    if (!company.active) {
      res.status(403).json({ error: 'Empresa inativa. Contate o administrador.' });
      return;
    }

    req.company = company;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar autenticação por API Key' });
  }
}
