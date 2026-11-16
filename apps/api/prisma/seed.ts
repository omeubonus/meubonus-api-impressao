import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@silentprint.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'Administrador SilentPrint',
      },
    });
    console.log(`✅ Administrador padrão criado: ${admin.email}`);
  } else {
    console.log(`ℹ️ Administrador já existente: ${existingAdmin.email}`);
  }

  const demoSlug = 'empresa-demo';
  const existingCompany = await prisma.company.findUnique({
    where: { slug: demoSlug },
  });

  if (!existingCompany) {
    const demoCompany = await prisma.company.create({
      data: {
        name: 'Empresa Demo',
        slug: demoSlug,
        apiKey: 'sp_live_demo_9876543210abcdef',
        active: true,
      },
    });
    console.log(`✅ Empresa Demo criada com API Key: ${demoCompany.apiKey}`);
  } else {
    console.log(`ℹ️ Empresa Demo já existente: ${existingCompany.name} (Key: ${existingCompany.apiKey})`);
  }

  console.log('✨ Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante execução do seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
