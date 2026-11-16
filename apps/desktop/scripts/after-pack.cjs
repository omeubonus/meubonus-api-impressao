const { execFileSync } = require('child_process');
const path = require('path');

/**
 * Hook afterPack do electron-builder:
 * No macOS (darwin), aplica assinatura ad-hoc profunda (codesign --force --deep --sign -)
 * selando todos os recursos (Info.plist e app.asar) e define o Designated Requirement
 * pelo bundle identifier para evitar o erro:
 * "code has no resources but signature indicates they must be present"
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appId = context.packager.appInfo.id || 'com.silentprint.desktop';
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`🔏 [afterPack] Assinando pacote macOS (ad-hoc deep + designated requirement): ${appPath}`);

  try {
    execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' });
  } catch {
    // Ignora caso xattr não encontre atributos estendidos
  }

  // 1. Assina recursivamente todos os frameworks, helpers e executáveis selando CodeResources
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  // 2. Define o Designated Requirement do bundle principal pelo identifier (e não pelo cdhash volátil)
  execFileSync(
    'codesign',
    ['--force', '--sign', '-', `-r=designated => identifier "${appId}"`, appPath],
    { stdio: 'inherit' }
  );

  // 3. Valida estritamente a assinatura gerada em tempo de build
  execFileSync('codesign', ['-vvv', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  });

  console.log(`✅ [afterPack] Assinatura macOS validada com sucesso para ${appName}.app (${appId})`);
};
