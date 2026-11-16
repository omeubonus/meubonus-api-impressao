import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authAdmin } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { generateApiKey } from '../../utils/code-generator';
import { AuthenticatedAdminRequest } from '../../types';

const router = Router();
router.use(authAdmin);

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const createCompanySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    slug: z.string().min(2).optional(),
  }),
});

const updateCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid('ID inválido'),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).optional(),
    active: z.boolean().optional(),
  }),
});

const companyParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID inválido'),
  }),
});

router.get('/', async (_req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            agents: true,
            jobs: true,
          },
        },
      },
    });

    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar empresas' });
  }
});

router.post('/', validate(createCompanySchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { name, slug: providedSlug } = req.body;
    let baseSlug = providedSlug ? slugify(providedSlug) : slugify(name);

    // Garante unicidade do slug
    let finalSlug = baseSlug;
    let counter = 1;
    while (await prisma.company.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const apiKey = generateApiKey();

    const company = await prisma.company.create({
      data: {
        name,
        slug: finalSlug,
        apiKey,
        active: true,
      },
    });

    res.status(201).json(company);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao criar empresa' });
  }
});

router.patch('/:id', validate(updateCompanySchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, slug: providedSlug, active } = req.body;

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }

    let finalSlug = company.slug;
    if (providedSlug && providedSlug !== company.slug) {
      finalSlug = slugify(providedSlug);
      const existing = await prisma.company.findUnique({ where: { slug: finalSlug } });
      if (existing && existing.id !== id) {
        res.status(409).json({ error: 'Slug já utilizado por outra empresa' });
        return;
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(providedSlug !== undefined && { slug: finalSlug }),
        ...(active !== undefined && { active }),
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar empresa' });
  }
});

router.post('/:id/regenerate-key', validate(companyParamSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }

    const newApiKey = generateApiKey();
    const updated = await prisma.company.update({
      where: { id },
      data: { apiKey: newApiKey },
    });

    res.json({ message: 'API Key regenerada com sucesso', apiKey: updated.apiKey });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao regenerar API Key' });
  }
});

router.delete('/:id', validate(companyParamSchema), async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }

    await prisma.company.delete({ where: { id } });
    res.json({ message: 'Empresa excluída com sucesso' });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao excluir empresa' });
  }
});

export default router;
