import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { env } from './env';

export async function bootstrapSystemDefaults(): Promise<void> {
  try {
    const adminEmail = env.ADMIN_EMAIL;
    const adminPassword = env.ADMIN_PASSWORD;

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
      console.log(`👤 Administrador inicial configurado: ${admin.email}`);
    } else {
      // Se a senha no ambiente for diferente do hash atual, atualiza para facilitar redefinição via ENV
      const isMatch = await bcrypt.compare(adminPassword, existingAdmin.passwordHash);
      if (!isMatch) {
        const newHash = await bcrypt.hash(adminPassword, 10);
        await prisma.adminUser.update({
          where: { id: existingAdmin.id },
          data: { passwordHash: newHash },
        });
        console.log(`🔑 Senha do administrador atualizada via variável de ambiente: ${adminEmail}`);
      }
    }

    // Garante ao menos uma empresa padrão para testes iniciais
    const companiesCount = await prisma.company.count();
    if (companiesCount === 0) {
      const demoSlug = 'empresa-demo';
      const demoCompany = await prisma.company.create({
        data: {
          name: 'Empresa Demo',
          slug: demoSlug,
          apiKey: 'sp_live_demo_9876543210abcdef',
          active: true,
        },
      });
      console.log(`🏢 Empresa Demo inicial criada com API Key: ${demoCompany.apiKey}`);
    }
  } catch (error) {
    console.error('⚠️ Falha ao inicializar dados padrão do sistema:', error);
  }
}
