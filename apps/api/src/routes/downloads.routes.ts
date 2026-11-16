import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

// Diretório onde os instaladores ficam armazenados no servidor / volume
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.resolve(process.cwd(), 'downloads');
const GITHUB_REPO = process.env.GITHUB_REPOSITORY || 'omeubonus/meubonus-api-impressao';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

export interface CachedReleaseAsset {
  name: string;
  size: number;
  apiUrl: string;
  downloadUrl: string;
}

export interface CachedRelease {
  version: string;
  assets: CachedReleaseAsset[];
  winAsset?: { name: string; size: string; apiUrl: string; downloadUrl: string };
  winMsiAsset?: { name: string; size: string; apiUrl: string; downloadUrl: string };
  macAsset?: { name: string; size: string; apiUrl: string; downloadUrl: string };
  winReady: boolean;
  macReady: boolean;
  isComplete: boolean;
  buildingVersion?: string | null;
  timestamp: number;
}

let cachedRelease: CachedRelease | null = null;
const CACHE_TTL_COMPLETE = 60 * 1000; // 1 minuto quando release está completa
const CACHE_TTL_BUILDING = 15 * 1000; // 15 segundos quando há compilação em andamento

function parseRelease(data: any): CachedRelease {
  const rawAssets: any[] = Array.isArray(data.assets) ? data.assets : [];
  // Ignora assets que ainda estão em upload (state !== 'uploaded') pelo electron-builder
  const uploadedAssets = rawAssets.filter((a: any) => !a.state || a.state === 'uploaded');

  const parsedAssets: CachedReleaseAsset[] = uploadedAssets.map((a: any) => ({
    name: a.name,
    size: a.size,
    apiUrl: a.url,
    downloadUrl: a.browser_download_url,
  }));

  const exeAssets = uploadedAssets.filter((a: any) => typeof a.name === 'string' && a.name.endsWith('.exe'));
  const setupExe = exeAssets.find((a: any) => a.name.includes('Setup')) || exeAssets[0];
  const msiAsset = uploadedAssets.find((a: any) => typeof a.name === 'string' && a.name.endsWith('.msi'));
  const dmgAsset = uploadedAssets.find((a: any) => typeof a.name === 'string' && a.name.endsWith('.dmg'));
  const macZipAsset = uploadedAssets.find((a: any) => typeof a.name === 'string' && a.name.endsWith('.zip'));

  // electron-builder publica latest.yml (Windows) e latest-mac.yml (macOS) apenas no final do upload de cada SO
  const hasLatestWinYml = uploadedAssets.some((a: any) => a.name === 'latest.yml');
  const hasLatestMacYml = uploadedAssets.some((a: any) => a.name === 'latest-mac.yml');

  const winReady = Boolean(setupExe && hasLatestWinYml);
  const macReady = Boolean((dmgAsset || macZipAsset) && hasLatestMacYml);
  const isComplete = winReady && macReady;

  const result: CachedRelease = {
    version: data.tag_name ? String(data.tag_name).replace(/^(desktop-)?v/, '') : '1.0.0',
    assets: parsedAssets,
    winReady,
    macReady,
    isComplete,
    buildingVersion: null,
    timestamp: Date.now(),
  };

  if (setupExe) {
    result.winAsset = {
      name: setupExe.name,
      size: `${(setupExe.size / (1024 * 1024)).toFixed(1)} MB`,
      apiUrl: setupExe.url,
      downloadUrl: setupExe.browser_download_url,
    };
  }

  if (msiAsset) {
    result.winMsiAsset = {
      name: msiAsset.name,
      size: `${(msiAsset.size / (1024 * 1024)).toFixed(1)} MB`,
      apiUrl: msiAsset.url,
      downloadUrl: msiAsset.browser_download_url,
    };
  }

  if (dmgAsset) {
    result.macAsset = {
      name: dmgAsset.name,
      size: `${(dmgAsset.size / (1024 * 1024)).toFixed(1)} MB`,
      apiUrl: dmgAsset.url,
      downloadUrl: dmgAsset.browser_download_url,
    };
  }

  return result;
}

export async function fetchLatestGitHubRelease(): Promise<CachedRelease | null> {
  const now = Date.now();
  const ttl = cachedRelease?.buildingVersion ? CACHE_TTL_BUILDING : CACHE_TTL_COMPLETE;
  if (cachedRelease && now - cachedRelease.timestamp < ttl) {
    return cachedRelease;
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'SilentPrint-Hub',
      Accept: 'application/vnd.github.v3+json',
    };
    if (GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    // Busca as últimas releases para garantir que só promovemos uma versão cujos arquivos realmente já foram compilados e enviados
    const listRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`, { headers });
    if (!listRes.ok) {
      const latestRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers });
      if (!latestRes.ok) return cachedRelease;
      const latestData = (await latestRes.json()) as any;
      const parsed = parseRelease(latestData);
      if (parsed.winReady || parsed.macReady) {
        cachedRelease = parsed;
      }
      return cachedRelease;
    }

    const listData = (await listRes.json()) as any[];
    if (!Array.isArray(listData) || !listData.length) return cachedRelease;

    const parsedList = listData.map((r) => ({
      raw: r,
      parsed: parseRelease(r),
    }));

    // Identifica se a release mais recente no topo ainda está sendo compilada no GitHub Actions (draft ou sem todos os binários)
    const newestEntry = parsedList[0];
    const isNewestStillBuilding = newestEntry && (newestEntry.raw.draft || !newestEntry.parsed.isComplete);
    const buildingVersion = isNewestStillBuilding ? newestEntry.parsed.version : null;

    // 1ª prioridade: Release publicada (!draft) que tenha TANTO Windows (.exe + latest.yml) QUANTO macOS (.dmg + latest-mac.yml) prontos
    const completeEntry = parsedList.find((item) => !item.raw.draft && item.parsed.isComplete);
    if (completeEntry) {
      cachedRelease = {
        ...completeEntry.parsed,
        buildingVersion:
          buildingVersion && buildingVersion !== completeEntry.parsed.version ? buildingVersion : null,
      };
      return cachedRelease;
    }

    // 2ª prioridade (fallback caso repositório só tenha compilado 1 plataforma até hoje): exige ao menos 1 instalador pronto
    const partialReadyEntry = parsedList.find(
      (item) => !item.raw.draft && (item.parsed.winReady || item.parsed.macReady)
    );
    if (partialReadyEntry) {
      cachedRelease = {
        ...partialReadyEntry.parsed,
        buildingVersion,
      };
      return cachedRelease;
    }

    return cachedRelease;
  } catch (err) {
    console.warn('⚠️ Não foi possível consultar releases do GitHub:', err);
    return cachedRelease;
  }
}

async function resolveAssetDownloadUrl(asset: { apiUrl: string; downloadUrl: string }): Promise<string> {
  if (!GITHUB_TOKEN) {
    return asset.downloadUrl;
  }

  try {
    const res = await fetch(asset.apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'SilentPrint-Hub',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/octet-stream',
      },
      redirect: 'manual',
    });

    const location = res.headers.get('location');
    if (location) {
      return location;
    }
  } catch (err) {
    console.warn('⚠️ Falha ao obter URL assinada do GitHub Asset:', err);
  }

  return asset.downloadUrl;
}

/**
 * GET /api/downloads/info
 * Retorna status de disponibilidade dos instaladores e metadados (apenas de versões com binários efetivamente compilados)
 */
router.get('/info', async (_req: Request, res: Response) => {
  let winAvailable = false;
  let macAvailable = false;
  let winFileName: string | null = null;
  let macFileName: string | null = null;
  let winFileSize: string | null = null;
  let macFileSize: string | null = null;
  let version = process.env.DESKTOP_LATEST_VERSION || '1.0.0';
  let buildingVersion: string | null = null;

  // 1. Verifica arquivos locais no diretório de downloads
  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const exe = files.find((f) => f.endsWith('.exe'));
      const dmg = files.find((f) => f.endsWith('.dmg'));

      if (exe) {
        winAvailable = true;
        winFileName = exe;
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, exe));
        winFileSize = `${(stat.size / (1024 * 1024)).toFixed(1)} MB`;
      }

      if (dmg) {
        macAvailable = true;
        macFileName = dmg;
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, dmg));
        macFileSize = `${(stat.size / (1024 * 1024)).toFixed(1)} MB`;
      }
    }
  } catch (err) {
    //
  }

  // 2. Se configurado via variáveis de ambiente
  if (process.env.DESKTOP_DOWNLOAD_URL_WIN) winAvailable = true;
  if (process.env.DESKTOP_DOWNLOAD_URL_MAC) macAvailable = true;

  let winMsiAvailable = false;
  let winMsiFileName = '';
  let winMsiFileSize = '';

  // 3. Consulta GitHub Releases (somente promove a versão se os arquivos realmente existirem na release)
  if (!winAvailable || !macAvailable) {
    const ghRelease = await fetchLatestGitHubRelease();
    if (ghRelease) {
      buildingVersion = ghRelease.buildingVersion || null;
      if (ghRelease.version && (ghRelease.winAsset || ghRelease.macAsset)) {
        version = ghRelease.version;
      }
      if (!winAvailable && ghRelease.winAsset) {
        winAvailable = true;
        winFileName = ghRelease.winAsset.name;
        winFileSize = ghRelease.winAsset.size;
      }
      if (ghRelease.winMsiAsset) {
        winMsiAvailable = true;
        winMsiFileName = ghRelease.winMsiAsset.name;
        winMsiFileSize = ghRelease.winMsiAsset.size;
      }
      if (!macAvailable && ghRelease.macAsset) {
        macAvailable = true;
        macFileName = ghRelease.macAsset.name;
        macFileSize = ghRelease.macAsset.size;
      }
    }
  }

  res.json({
    version,
    buildingVersion,
    windows: {
      available: winAvailable,
      fileName: winFileName || `SilentPrint-Agent-Setup-${version}.exe`,
      size: winFileSize || '~81 MB',
      downloadUrl: '/api/downloads/windows',
      msiAvailable: winMsiAvailable,
      msiFileName: winMsiFileName || `SilentPrint-Agent-${version}.msi`,
      msiSize: winMsiFileSize || '~80 MB',
      msiDownloadUrl: '/api/downloads/windows-msi',
    },
    mac: {
      available: macAvailable,
      fileName: macFileName || `SilentPrint-Agent-${version}-arm64.dmg`,
      size: macFileSize || '~98 MB',
      downloadUrl: '/api/downloads/mac',
    },
  });
});

/**
 * GET /api/downloads/windows
 * Download direto do instalador executável (.exe) do Windows
 */
router.get('/windows', async (_req: Request, res: Response) => {
  if (process.env.DESKTOP_DOWNLOAD_URL_WIN) {
    return res.redirect(process.env.DESKTOP_DOWNLOAD_URL_WIN);
  }

  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const exe = files.find((f) => f.endsWith('.exe'));
      if (exe) {
        const filePath = path.join(DOWNLOADS_DIR, exe);
        return res.download(filePath, exe);
      }
    }
  } catch (err) {
    //
  }

  const ghRelease = await fetchLatestGitHubRelease();
  if (ghRelease?.winAsset) {
    const url = await resolveAssetDownloadUrl(ghRelease.winAsset);
    return res.redirect(url);
  }

  res.status(404).json({
    error: 'Instalador do Windows (.exe) ainda não foi disponibilizado na pasta downloads do servidor.',
    hint: 'Faça upload do arquivo .exe para o volume /downloads ou configure a variável DESKTOP_DOWNLOAD_URL_WIN.',
  });
});

/**
 * GET /api/downloads/windows-msi
 * Download direto do pacote de instalação Windows Installer (.msi)
 */
router.get('/windows-msi', async (_req: Request, res: Response) => {
  if (process.env.DESKTOP_DOWNLOAD_URL_WIN_MSI) {
    return res.redirect(process.env.DESKTOP_DOWNLOAD_URL_WIN_MSI);
  }

  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const msi = files.find((f) => f.endsWith('.msi'));
      if (msi) {
        const filePath = path.join(DOWNLOADS_DIR, msi);
        return res.download(filePath, msi);
      }
    }
  } catch (err) {
    //
  }

  const ghRelease = await fetchLatestGitHubRelease();
  if (ghRelease?.winMsiAsset) {
    const url = await resolveAssetDownloadUrl(ghRelease.winMsiAsset);
    return res.redirect(url);
  }

  res.status(404).json({
    error: 'Pacote de instalação do Windows (.msi) ainda não disponível.',
    hint: 'Aguarde a esteira de build gerar o pacote .msi ou faça upload para /downloads.',
  });
});

/**
 * GET /api/downloads/mac
 * Download direto da imagem de disco do macOS
 */
router.get('/mac', async (_req: Request, res: Response) => {
  if (process.env.DESKTOP_DOWNLOAD_URL_MAC) {
    return res.redirect(process.env.DESKTOP_DOWNLOAD_URL_MAC);
  }

  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const dmg = files.find((f) => f.endsWith('.dmg'));
      if (dmg) {
        const filePath = path.join(DOWNLOADS_DIR, dmg);
        return res.download(filePath, dmg);
      }
    }
  } catch (err) {
    //
  }

  const ghRelease = await fetchLatestGitHubRelease();
  if (ghRelease?.macAsset) {
    const url = await resolveAssetDownloadUrl(ghRelease.macAsset);
    return res.redirect(url);
  }

  res.status(404).json({
    error: 'Instalador do macOS (.dmg) ainda não foi disponibilizado na pasta downloads do servidor.',
    hint: 'Faça upload do arquivo .dmg para o volume /downloads ou configure a variável DESKTOP_DOWNLOAD_URL_MAC.',
  });
});

/**
 * GET /api/downloads/updates/:platform/:file
 * GET /api/downloads/updates/:file
 * Proxy seguro para electron-updater (generic provider) em repositórios privados
 */
const handleUpdateFeedRequest = async (req: Request, res: Response) => {
  const file = String(req.params.file || '');
  if (!file) {
    return res.status(400).json({ error: 'Nome de arquivo inválido' });
  }

  const ghRelease = await fetchLatestGitHubRelease();
  if (!ghRelease || !ghRelease.assets) {
    return res.status(503).json({ error: 'Releases do GitHub indisponíveis no momento' });
  }

  const normalize = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, '');
  const asset = ghRelease.assets.find(
    (a) => a.name === file || normalize(a.name) === normalize(file)
  );
  if (!asset) {
    return res.status(404).json({ error: `Arquivo ${file} não encontrado na versão ${ghRelease.version}` });
  }

  // Se for manifesto YAML (latest.yml ou latest-mac.yml), faz o stream do texto diretamente
  if (file.endsWith('.yml')) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'SilentPrint-Hub',
        Accept: 'application/octet-stream',
      };
      if (GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
      }
      const ghRes = await fetch(asset.apiUrl, { headers });
      if (!ghRes.ok) {
        return res.status(ghRes.status).send('Erro ao obter manifesto');
      }
      const ymlText = await ghRes.text();
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(ymlText);
    } catch (err: any) {
      return res.status(500).json({ error: 'Falha ao processar manifesto de atualização' });
    }
  }

  // Se for arquivo binário (.zip, .exe, .dmg, .blockmap), redireciona para a URL assinada
  const downloadUrl = await resolveAssetDownloadUrl(asset);
  return res.redirect(downloadUrl);
};

router.get('/updates/:platform/:file', handleUpdateFeedRequest);
router.get('/updates/:file', handleUpdateFeedRequest);

export default router;
