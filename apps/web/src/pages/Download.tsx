import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Printer,
  Download as DownloadIcon,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  Laptop,
  Apple,
  Cpu,
  Wifi,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { BrandLogo } from '../components/BrandLogo';
import { useBranding } from '../context/BrandingContext';
import { API_BASE_URL } from '../lib/api';

interface DownloadInfo {
  version: string;
  windows: {
    available: boolean;
    fileName: string;
    size: string;
    downloadUrl: string;
    msiAvailable?: boolean;
    msiFileName?: string;
    msiSize?: string;
    msiDownloadUrl?: string;
  };
  mac: {
    available: boolean;
    fileName: string;
    size: string;
    downloadUrl: string;
  };
}

export function Download() {
  const { brand } = useBranding();
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detecta SO do visitante
    const ua = navigator.userAgent.toLowerCase();
    const isApple = ua.includes('macintosh') || ua.includes('mac os x');
    setIsMac(isApple);

    // Consulta metadados da API usando API_BASE_URL
    fetch(`${API_BASE_URL}/api/downloads/info`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setDownloadInfo(data))
      .catch(() => {
        // Fallback local se a API estiver offline
        setDownloadInfo({
          version: '1.0.0',
          windows: {
            available: true,
            fileName: 'SilentPrint-Agent-Setup-1.0.0.exe',
            size: '~81 MB',
            downloadUrl: `${API_BASE_URL}/api/downloads/windows`,
          },
          mac: {
            available: true,
            fileName: 'SilentPrint-Agent-1.0.0-arm64.dmg',
            size: '~98 MB',
            downloadUrl: `${API_BASE_URL}/api/downloads/mac`,
          },
        });
      });
  }, []);

  const resolveDownloadUrl = (url?: string, defaultPath: string = '') => {
    const target = url || defaultPath;
    if (!target) return '#';
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return target;
    }
    return `${API_BASE_URL}${target.startsWith('/') ? '' : '/'}${target}`;
  };

  const version = downloadInfo?.version || '1.0.0';

  return (
    <div className="min-h-screen bg-canvas-950 text-slate-100 flex flex-col font-sans selection:bg-accent-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-accent-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-10 border-b border-surface-border/80 bg-canvas-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/">
            <BrandLogo variant="header" />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-xs text-surface-muted hover:text-white transition font-medium px-3 py-1.5 rounded-lg hover:bg-surface-card"
            >
              Área Administrativa
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-4xl mx-auto px-4 py-12 md:py-16 w-full space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-card/80 px-3.5 py-1 text-xs text-slate-300 backdrop-blur-sm shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-accent-400" />
            <span>Versão Oficial <strong>v{version}</strong> • Sem Zadig • 100% Silencioso</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
            Agente de Impressão <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-400 via-accent-500 to-accent-400">
              {brand.downloadHeadline}
            </span>
          </h1>

          <p className="text-sm sm:text-base text-surface-muted leading-relaxed">
            {brand.downloadDescription}
          </p>

          {/* Action Download Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            {/* Botão Primário (Detecta SO) */}
            {isMac ? (
              <a
                href={resolveDownloadUrl(downloadInfo?.mac.downloadUrl, '/api/downloads/mac')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-accent-600 hover:bg-accent-500 px-6 py-3.5 text-sm font-bold text-accent-foreground shadow-lg shadow-accent-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Apple className="h-5 w-5" />
                <span>Baixar Instalador macOS (.dmg)</span>
                <span className="text-[11px] font-normal opacity-80 border-l border-current/20 pl-2">
                  {downloadInfo?.mac.size || '~98 MB'}
                </span>
              </a>
            ) : (
              <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                <a
                  href={resolveDownloadUrl(downloadInfo?.windows.downloadUrl, '/api/downloads/windows')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-accent-600 hover:bg-accent-500 px-6 py-3.5 text-sm font-bold text-accent-foreground shadow-lg shadow-accent-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Laptop className="h-5 w-5" />
                  <span>Baixar Instalador Windows (Setup .exe)</span>
                  <span className="text-[11px] font-normal opacity-80 border-l border-current/20 pl-2">
                    {downloadInfo?.windows.size || '~81 MB'}
                  </span>
                </a>
                {downloadInfo?.windows.msiAvailable && (
                  <a
                    href={resolveDownloadUrl(downloadInfo.windows.msiDownloadUrl, '/api/downloads/windows-msi')}
                    className="text-xs text-slate-400 hover:text-white underline underline-offset-4 transition"
                  >
                    Ou baixar Pacote Corporativo Windows (.msi)
                  </a>
                )}
              </div>
            )}

            {/* Botão Secundário para o outro SO */}
            {isMac ? (
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <a
                  href={resolveDownloadUrl(downloadInfo?.windows.downloadUrl, '/api/downloads/windows')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-card/80 hover:bg-surface-card px-5 py-3.5 text-xs font-semibold text-slate-300 transition hover:text-white"
                >
                  <Laptop className="h-4 w-4 text-surface-muted" />
                  <span>Instalador Windows (Setup .exe)</span>
                </a>
                {downloadInfo?.windows.msiAvailable && (
                  <a
                    href={resolveDownloadUrl(downloadInfo.windows.msiDownloadUrl, '/api/downloads/windows-msi')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-card/80 hover:bg-surface-card px-4 py-3.5 text-xs font-semibold text-slate-300 transition hover:text-white"
                  >
                    <span>Pacote (.msi)</span>
                  </a>
                )}
              </div>
            ) : (
              <a
                href={resolveDownloadUrl(downloadInfo?.mac.downloadUrl, '/api/downloads/mac')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-card/80 hover:bg-surface-card px-5 py-3.5 text-xs font-semibold text-slate-300 transition hover:text-white"
              >
                <Apple className="h-4 w-4 text-surface-muted" />
                <span>Instalador macOS (.dmg)</span>
              </a>
            )}
          </div>

          <p className="text-[11px] text-surface-muted pt-1 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Instalador oficial verificado com soma de verificação SHA-512</span>
          </p>
        </div>

        {/* 3 Step Onboarding Guide */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-white tracking-tight">Como Configurar em 3 Passos Simples</h2>
            <p className="text-xs text-surface-muted mt-0.5">Sem drivers complicados ou alterações no roteador.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Passo 1 */}
            <Card className="border-surface-border bg-surface-card/80 relative overflow-hidden">
              <div className="absolute top-3 right-3 text-3xl font-black text-slate-800 pointer-events-none">
                01
              </div>
              <CardContent className="pt-6 pb-5 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-accent-500/10 border border-accent-500/20 text-accent-400 flex items-center justify-center mb-3">
                  <DownloadIcon className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-white">1. Instale o Aplicativo</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Execute o instalador com 2 cliques. Ele cria o atalho, inicia automaticamente na bandeja do sistema (*System Tray*) e detecta todas as impressoras conectadas.
                </p>
              </CardContent>
            </Card>

            {/* Passo 2 */}
            <Card className="border-surface-border bg-surface-card/80 relative overflow-hidden">
              <div className="absolute top-3 right-3 text-3xl font-black text-slate-800 pointer-events-none">
                02
              </div>
              <CardContent className="pt-6 pb-5 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                  <Cpu className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-white">2. Copie o Código Único</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Ao abrir, o agente gera um código visual exclusivo no formato <span className="font-mono text-emerald-400 font-bold bg-canvas-900 px-1 py-0.5 rounded border border-surface-border">IMP-XXXXXX</span> com botão de copiar.
                </p>
              </CardContent>
            </Card>

            {/* Passo 3 */}
            <Card className="border-surface-border bg-surface-card/80 relative overflow-hidden">
              <div className="absolute top-3 right-3 text-3xl font-black text-slate-800 pointer-events-none">
                03
              </div>
              <CardContent className="pt-6 pb-5 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-white">3. Cole no seu Sistema</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Informe o código no sistema de gestão da sua empresa. A conexão é confirmada instantaneamente e os cupons já começam a imprimir.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="rounded-2xl border border-surface-border bg-canvas-900/60 p-6 md:p-8 space-y-6">
          <div className="text-center max-w-lg mx-auto">
            <h2 className="text-lg font-bold text-white">Construído para Estabilidade no Ponto de Venda</h2>
            <p className="text-xs text-surface-muted mt-1">Confiabilidade para cozinhas, caixas e impressão em alta demanda.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-card/50 border border-surface-border/60">
              <Printer className="h-4 w-4 text-accent-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block mb-0.5">Spooler & Térmicas</strong>
                <span className="text-surface-muted">Suporte a Epson, Bematech, Elgin, Daruma, Zebra e impressoras A4.</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-card/50 border border-surface-border/60">
              <Wifi className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block mb-0.5">Rede Direta TCP :9100</strong>
                <span className="text-surface-muted">Imprima diretamente em impressoras de rede via IP com comandos ESC/POS.</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-card/50 border border-surface-border/60">
              <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block mb-0.5">Fila Offline Resiliente</strong>
                <span className="text-surface-muted">Se a internet cair, o Hub segura as impressões e descarrega assim que reconectar.</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="space-y-4 max-w-2xl mx-auto">
          <h2 className="text-lg font-bold text-white text-center flex items-center justify-center gap-2">
            <HelpCircle className="h-4 w-4 text-accent-500" />
            Dúvidas Frequentes
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="rounded-xl border border-surface-border bg-surface-card/70 p-4 space-y-1">
              <h4 className="font-semibold text-white">Preciso abrir portas no meu roteador?</h4>
              <p className="text-surface-muted leading-relaxed">
                Não! O SilentPrint Agent utiliza uma conexão WebSocket de saída segura para a nuvem. Ele funciona mesmo atrás de firewalls e roteadores convencionais sem nenhuma configuração de rede.
              </p>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface-card/70 p-4 space-y-1">
              <h4 className="font-semibold text-white">Preciso reiniciar o aplicativo todos os dias?</h4>
              <p className="text-surface-muted leading-relaxed">
                Não. O aplicativo inicia automaticamente junto com o sistema operacional e opera silenciosamente na bandeja do relógio (*System Tray*).
              </p>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface-card/70 p-4 space-y-1">
              <h4 className="font-semibold text-white">Como funcionam as atualizações?</h4>
              <p className="text-surface-muted leading-relaxed">
                O agente baixa atualizações em segundo plano e aplica com travas de segurança operacional, garantindo que o caixa nunca seja interrompido durante uma impressão.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-surface-border/80 bg-canvas-950 py-6 text-center text-xs text-surface-muted">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} SilentPrint Hub • Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-white transition">Painel Admin</Link>
            <span>•</span>
            <span className="font-mono text-slate-400">v{version}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
