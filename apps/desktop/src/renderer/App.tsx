import React, { useState, useEffect } from 'react';
import {
  Printer,
  Copy,
  Check,
  RefreshCw,
  Network,
  Settings,
  History,
  Building2,
  Trash2,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  Power,
  Unlink,
  X,
  Server,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  ArrowUpCircle,
  Loader2,
} from 'lucide-react';
import { AgentState, PrintJobRecord } from '../types';
import {
  applyDesktopBrand,
  resolveDesktopBrand,
} from './config/branding';

export default function App() {
  const [state, setState] = useState<AgentState | null>(null);
  const [activeTab, setActiveTab] = useState<'printers' | 'history' | 'settings'>('printers');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isPrintingTest, setIsPrintingTest] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal TCP Printer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tcpName, setTcpName] = useState('');
  const [tcpHost, setTcpHost] = useState('');
  const [tcpPort, setTcpPort] = useState(9100);
  const [tcpModalError, setTcpModalError] = useState<string | null>(null);
  const [isSavingTcp, setIsSavingTcp] = useState(false);

  // Settings
  const [hubUrlInput, setHubUrlInput] = useState('');
  const [isSavingHub, setIsSavingHub] = useState(false);
  const [showConfirmHubModal, setShowConfirmHubModal] = useState(false);
  const [showUnclaimConfirm, setShowUnclaimConfirm] = useState(false);
  const [isUnclaiming, setIsUnclaiming] = useState(false);

  // Configurações Avançadas retrátil
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  // Identidade visual sincronizada automaticamente pelo Painel Web (fonte da verdade)
  const brand = resolveDesktopBrand(state?.branding);

  useEffect(() => {
    applyDesktopBrand(brand);
  }, [brand.id, brand.name, brand.logoUrl, brand.colors.accent500, brand.colors.canvas950]);

  // Modais de Atualização (Etapa 1: Confirmar Download | Etapa 2: Confirmar Reinicialização)
  const [updatePrompt, setUpdatePrompt] = useState<{
    type: 'CONFIRM_DOWNLOAD' | 'CONFIRM_RESTART';
    version: string;
    secondsLeft: number;
    isPaused: boolean;
  } | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleConfirmDownloadUpdate = async () => {
    try {
      setIsDownloadingUpdate(true);
      showToast('Iniciando download da atualização...', 'info');
      setUpdatePrompt(null);
      const res = await window.electronAPI.downloadUpdate();
      if (!res.success && res.error) {
        showToast(res.error, 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Falha ao baixar atualização', 'error');
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  const handleAutoApplyUpdate = async (force = false) => {
    try {
      setIsApplyingUpdate(true);
      const res = await window.electronAPI.installUpdate(force);
      if (!res.success && res.reason) {
        showToast(res.reason, 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Falha ao aplicar atualização', 'error');
    } finally {
      setIsApplyingUpdate(false);
      setUpdatePrompt(null);
    }
  };

  useEffect(() => {
    // Carrega estado inicial
    window.electronAPI.getState().then((initialState) => {
      setState(initialState);
      setHubUrlInput(initialState.hubUrl);
    });

    // Escuta atualizações de estado do Electron Main
    const cleanupState = window.electronAPI.onStateUpdate((updatedState) => {
      setState(updatedState);
    });

    // Escuta novos trabalhos de impressão em tempo real
    const cleanupJob = window.electronAPI.onPrintJobReceived((job: PrintJobRecord) => {
      showToast(`Nova impressão: ${job.title}`, 'info');
    });

    // Escuta notificação de atualização (CONFIRM_DOWNLOAD ou CONFIRM_RESTART)
    const cleanupPrompt = window.electronAPI.onUpdatePrompt((data) => {
      const type = data.type || (data.countdownSeconds && data.countdownSeconds > 0 ? 'CONFIRM_RESTART' : 'CONFIRM_DOWNLOAD');
      setUpdatePrompt({
        type,
        version: data.version,
        secondsLeft: data.countdownSeconds || (type === 'CONFIRM_RESTART' ? 20 : 0),
        isPaused: false,
      });
    });

    return () => {
      cleanupState();
      cleanupJob();
      cleanupPrompt();
    };
  }, []);

  // Efeito do contador regressivo de 20s na etapa de reinicialização
  useEffect(() => {
    if (!updatePrompt || updatePrompt.type !== 'CONFIRM_RESTART' || updatePrompt.isPaused) return;

    if (updatePrompt.secondsLeft <= 0) {
      handleAutoApplyUpdate(true);
      return;
    }

    const timer = setTimeout(() => {
      setUpdatePrompt((prev) => {
        if (!prev || prev.type !== 'CONFIRM_RESTART' || prev.isPaused) return prev;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [updatePrompt?.type, updatePrompt?.isPaused, updatePrompt?.secondsLeft]);

  const handleCopyCode = async () => {
    if (!state?.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopiedCode(true);
      showToast('Código IMP copiado!', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast('Falha ao copiar código', 'error');
    }
  };

  const handleDefaultPrinterChange = async (printerName: string) => {
    setState((prev) => (prev ? { ...prev, defaultPrinter: printerName } : prev));
    try {
      const res = await window.electronAPI.setDefaultPrinter(printerName);
      if (res.success) {
        showToast(`Padrão: ${printerName}`, 'success');
        const freshState = await window.electronAPI.getState();
        setState(freshState);
      } else {
        showToast(res.error || 'Erro ao definir impressora padrão', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePrintTest = async (printerName?: string) => {
    setIsPrintingTest(true);
    try {
      const target = printerName || state?.defaultPrinter || undefined;
      const res = await window.electronAPI.printTest(target);
      if (res.success) {
        showToast('Impressão de teste enviada!', 'success');
      } else {
        showToast(res.error || 'Falha ao executar teste', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsPrintingTest(false);
    }
  };

  const handleRefreshPrinters = async () => {
    setIsRefreshing(true);
    try {
      await window.electronAPI.refreshPrinters();
      showToast('Lista de impressoras atualizada!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddTcpPrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    setTcpModalError(null);
    if (!tcpName.trim() || !tcpHost.trim()) {
      const msg = 'Preencha o nome e o IP/Host da impressora.';
      setTcpModalError(msg);
      showToast(msg, 'error');
      return;
    }

    setIsSavingTcp(true);
    try {
      const res = await window.electronAPI.addTcpPrinter({
        name: tcpName.trim(),
        host: tcpHost.trim(),
        port: Number(tcpPort) || 9100,
      });

      if (res.success) {
        showToast(`Impressora "${tcpName.trim()}" adicionada!`, 'success');
        setIsModalOpen(false);
        setTcpName('');
        setTcpHost('');
        setTcpPort(9100);
        setTcpModalError(null);
        const freshState = await window.electronAPI.getState();
        setState(freshState);
      } else {
        const msg = res.error || 'Erro ao cadastrar impressora de rede';
        setTcpModalError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err?.message || 'Erro ao cadastrar impressora de rede';
      setTcpModalError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSavingTcp(false);
    }
  };

  const handleRemoveTcpPrinter = async (printerName: string) => {
    // Atualização otimista imediata na interface
    setState((prev) => {
      if (!prev) return prev;
      const target = printerName.trim().toLowerCase();
      const updatedPrinters = prev.printers.filter(
        (p) => p.name.trim().toLowerCase() !== target && p.displayName.trim().toLowerCase() !== target
      );
      return {
        ...prev,
        printers: updatedPrinters,
        defaultPrinter: prev.defaultPrinter?.trim().toLowerCase() === target ? null : prev.defaultPrinter,
      };
    });

    try {
      const res = await window.electronAPI.removeTcpPrinter(printerName);
      if (res.success) {
        showToast(`Impressora "${printerName}" removida.`, 'success');
        const freshState = await window.electronAPI.getState();
        setState(freshState);
      } else {
        const freshState = await window.electronAPI.getState();
        setState(freshState);
        showToast(res.error || 'Erro ao remover impressora', 'error');
      }
    } catch (err: any) {
      const freshState = await window.electronAPI.getState();
      setState(freshState);
      showToast(err.message, 'error');
    }
  };

  const handleTriggerSaveHubUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hubUrlInput.trim()) return;
    if (hubUrlInput.trim() === state?.hubUrl) {
      showToast('Endereço do HUB já está atualizado.', 'info');
      return;
    }
    // Abre modal de confirmação após alterar
    setShowConfirmHubModal(true);
  };

  const handleConfirmSaveHubUrl = async () => {
    if (!hubUrlInput.trim()) return;
    setIsSavingHub(true);
    try {
      const res = await window.electronAPI.setHubUrl(hubUrlInput.trim());
      if (res.success) {
        showToast('Endereço do HUB alterado! Reconectando...', 'success');
        setShowConfirmHubModal(false);
      } else {
        showToast(res.error || 'Erro ao alterar HUB URL', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingHub(false);
    }
  };

  const handleToggleAutostart = async () => {
    if (!state) return;
    const nextVal = !state.autostart;
    try {
      await window.electronAPI.setAutostart(nextVal);
      showToast(nextVal ? 'Inicialização automática ativada!' : 'Inicialização automática desativada!', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleUnclaim = async () => {
    setIsUnclaiming(true);
    try {
      const res = await window.electronAPI.unclaim();
      if (res.success) {
        showToast('Agente desvinculado com sucesso!', 'success');
        setShowUnclaimConfirm(false);
      } else {
        showToast(res.error || 'Erro ao desvincular agente', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsUnclaiming(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await window.electronAPI.clearHistory();
      showToast('Histórico local apagado.', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (!state) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas-900 text-surface-muted">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-7 w-7 animate-spin text-accent-500" />
          <p className="text-xs font-medium tracking-wide text-slate-300">Iniciando {brand.name} Agent...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas-900 text-slate-100 select-none overflow-hidden font-sans">
      {/* Toast Notification Flutuante */}
      {toastMessage && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-xl border border-surface-border bg-surface-card/95 px-3.5 py-2 text-xs shadow-2xl backdrop-blur-md animate-fade-in max-w-[90vw] truncate">
          {toastMessage.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
          {toastMessage.type === 'info' && <Clock className="h-3.5 w-3.5 text-accent-500 shrink-0" />}
          <span className="font-medium text-slate-200 truncate">{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header - Limpo e direto, sem cápsulas soltas */}
      <header className="flex items-center justify-between border-b border-surface-border bg-canvas-900/95 px-4 py-3 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {!brand.logoUrl && (
            state?.isDev ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-sm shadow-rose-500/20 shrink-0">
                <Printer className="h-4 w-4 text-rose-400" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10 border border-accent-500/30 text-accent-500 shadow-sm shrink-0">
                <Printer className="h-4 w-4 text-accent-500" />
              </div>
            )
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className="h-5 w-auto max-w-[120px] object-contain"
                />
              ) : null}
              {(brand.showLogoText || !brand.logoUrl) && (
                <h1 className="text-xs font-bold tracking-tight text-white truncate">{brand.name}</h1>
              )}
              <span className="text-[9px] uppercase font-semibold tracking-wider text-surface-muted bg-surface-subtle px-1 py-0.2 rounded border border-surface-border">
                v{state?.version || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.1')}
              </span>
              {state?.isDev && (
                <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1 py-0.2 rounded tracking-wide">
                  DEV
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-surface-muted truncate">
              {state.company ? (
                <>
                  <Building2 className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                  <span className="text-slate-300 font-medium truncate">{state.company.name}</span>
                </>
              ) : (
                <span className="text-amber-400 font-normal">Aguardando vínculo</span>
              )}
            </div>
          </div>
        </div>

        {/* Hub Connection Indicator: apenas a bolinha com tooltip no hover */}
        <div className="relative flex items-center justify-center group pl-2">
          <div
            className="flex items-center justify-center p-2 rounded-full hover:bg-surface-card transition-colors cursor-pointer"
            title={state.connected ? 'Hub Conectado' : 'Reconectando ao Hub...'}
            onMouseEnter={() => {
              showToast(state.connected ? 'Hub Conectado' : 'Reconectando ao Hub...', state.connected ? 'success' : 'info');
            }}
          >
            {state.connected ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
              </span>
            ) : (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-sm shadow-amber-500/50"></span>
              </span>
            )}
          </div>

          {/* Floating Hover Tooltip */}
          <div className="pointer-events-none absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-surface-card border border-surface-border px-2.5 py-1 text-[10px] font-medium text-slate-200 shadow-xl z-50 backdrop-blur-sm animate-fade-in">
            <span className={`h-1.5 w-1.5 rounded-full ${state.connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {state.connected ? 'Hub Conectado' : 'Reconectando ao Hub...'}
          </div>
        </div>
      </header>

      {/* Main Content Scroll Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5">
        {/* Banner Visível de Atualização em Tempo Real */}
        {state.updateInfo && state.updateInfo.status !== 'IDLE' && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-2 animate-fade-in">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                {state.updateInfo.status === 'CHECKING' || state.updateInfo.status === 'DOWNLOADING' || state.updateInfo.status === 'AVAILABLE' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
                ) : state.updateInfo.status === 'ERROR' ? (
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                )}
                <span>
                  {state.updateInfo.status === 'CHECKING' && 'Buscando nova atualização no Hub...'}
                  {state.updateInfo.status === 'AVAILABLE' && `Nova versão v${state.updateInfo.availableVersion} encontrada! Iniciando download...`}
                  {state.updateInfo.status === 'DOWNLOADING' && `Baixando atualização v${state.updateInfo.availableVersion || ''} (${state.updateInfo.downloadProgress || 0}%)...`}
                  {state.updateInfo.status === 'DOWNLOADED' && `Atualização v${state.updateInfo.availableVersion || ''} pronta para instalar!`}
                  {state.updateInfo.status === 'ERROR' && `Falha ao atualizar: ${state.updateInfo.error || 'Erro de conexão'}`}
                </span>
              </div>
              {state.updateInfo.status === 'DOWNLOADED' && (
                <button
                  onClick={() => handleAutoApplyUpdate(true)}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow-sm shrink-0"
                >
                  Instalar Agora
                </button>
              )}
            </div>
            {state.updateInfo.status === 'DOWNLOADING' && (
              <div className="w-full h-1.5 bg-canvas-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${state.updateInfo.downloadProgress || 5}%` }}
                />
              </div>
            )}
          </section>
        )}

        {/* Minimalist Pairing Code Card */}
        <section className="relative overflow-hidden rounded-2xl border border-surface-border bg-surface-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
              Código de Pareamento
            </span>
            <button
              onClick={handleCopyCode}
              disabled={!state.code}
              className="flex items-center gap-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedCode ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div className="mt-2 mb-1.5">
            <span className="text-2xl font-extrabold tracking-widest font-mono text-white drop-shadow-sm">
              {state.code || 'GERANDO...'}
            </span>
          </div>

          <p className="text-[11px] text-surface-muted leading-snug">
            {state.company
              ? `Vinculado com sucesso à ${state.company.name}.`
              : 'Informe no Painel Web em Agentes > Vincular Agente para conectar este PDV.'}
          </p>
        </section>

        {/* TAB 1: Impressoras Detectadas */}
        {activeTab === 'printers' && (
          <div className="space-y-3 w-full">
            {/* Action Bar */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-muted">
                Impressoras ({state.printers.length})
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1 rounded-lg bg-accent-600 hover:bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  IP:9100
                </button>

                <button
                  onClick={handleRefreshPrinters}
                  disabled={isRefreshing}
                  className="flex items-center justify-center rounded-lg border border-surface-border bg-surface-card hover:bg-surface-cardHover p-1.5 text-slate-300 transition active:scale-95 disabled:opacity-50"
                  title="Recarregar impressoras"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-accent-500' : ''}`} />
                </button>
              </div>
            </div>

            {/* Printers List */}
            {state.printers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-surface-border bg-surface-card/40">
                <Printer className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-300">Nenhuma impressora encontrada</p>
                <p className="text-[11px] text-surface-muted mt-1 max-w-[240px]">
                  Conecte via USB/SO ou cadastre uma impressora de rede TCP (:9100).
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 w-full">
                {state.printers.map((printer) => {
                  const isDefault = state.defaultPrinter === printer.name;
                  const isTcp = printer.type === 'NETWORK_TCP';

                  return (
                    <div
                      key={printer.name}
                      className={`flex flex-col gap-2 p-3.5 rounded-xl border transition ${
                        isDefault
                          ? 'border-accent-600/40 bg-surface-card shadow-sm'
                          : 'border-surface-border bg-surface-card hover:border-surface-cardHover'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-subtle text-slate-300 shrink-0">
                            {isTcp ? <Network className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-xs font-semibold text-white truncate max-w-[170px]">
                                {printer.displayName}
                              </h3>
                              {isDefault && (
                                <span className="rounded bg-accent-600/15 px-1.5 py-0.2 text-[9px] font-bold text-accent-500 border border-accent-600/30">
                                  PADRÃO
                                </span>
                              )}
                              <span className="rounded px-1.5 py-0.2 text-[9px] font-medium border bg-surface-subtle text-surface-muted border-surface-border">
                                {isTcp ? 'TCP :9100' : 'SPOOLER'}
                              </span>
                            </div>
                            <p className="text-[11px] text-surface-muted truncate mt-0.5">
                              {isTcp ? `${printer.host}:${printer.port}` : printer.description || printer.name}
                            </p>
                          </div>
                        </div>

                        {isTcp && (
                          <button
                            onClick={() => handleRemoveTcpPrinter(printer.name)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition shrink-0"
                            title="Remover impressora"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Action buttons inside the printer card (Neutral secondary style) */}
                      <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-surface-border/60">
                        {!isDefault && (
                          <button
                            onClick={() => handleDefaultPrinterChange(printer.name)}
                            className="rounded-lg border border-surface-border bg-surface-subtle hover:bg-surface-cardHover px-2.5 py-1 text-[11px] font-medium text-slate-200 transition active:scale-95"
                          >
                            Tornar Padrão
                          </button>
                        )}

                        <button
                          onClick={() => handlePrintTest(printer.name)}
                          disabled={isPrintingTest}
                          className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-subtle hover:bg-surface-cardHover px-2.5 py-1 text-[11px] font-medium text-slate-200 transition active:scale-95 disabled:opacity-50"
                        >
                          <Printer className="h-3 w-3 text-slate-400" />
                          {isPrintingTest ? 'Testando...' : 'Testar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Histórico Local */}
        {activeTab === 'history' && (
          <div className="space-y-3 w-full">
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-muted">
                Histórico ({state.history.length})
              </span>

              {state.history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-card hover:bg-surface-cardHover px-2.5 py-1 text-xs text-slate-300 transition active:scale-95"
                >
                  <Trash2 className="h-3 w-3 text-slate-400" />
                  Limpar
                </button>
              )}
            </div>

            {state.history.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-surface-border bg-surface-card/40">
                <Clock className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-300">Nenhum registro ainda</p>
                <p className="text-[11px] text-surface-muted mt-1 max-w-[240px]">
                  As ordens de impressão despachadas aparecerão aqui em tempo real.
                </p>
              </div>
            ) : (
              <div className="space-y-2 w-full">
                {state.history.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-surface-border bg-surface-card hover:bg-surface-cardHover transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold shrink-0 ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                            : job.status === 'FAILED'
                            ? 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                            : 'bg-surface-subtle text-slate-300 border border-surface-border animate-pulse'
                        }`}
                      >
                        {job.type.slice(0, 3)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-semibold text-white truncate max-w-[150px]">{job.title}</h4>
                          <span className="text-[9px] text-surface-muted font-mono">#{job.id.slice(0, 6)}</span>
                        </div>
                        <p className="text-[10px] text-surface-muted truncate">
                          {job.printerName} • {new Date(job.createdAt).toLocaleTimeString('pt-BR')}
                        </p>
                        {job.errorMessage && (
                          <p className="text-[10px] text-rose-400 truncate">{job.errorMessage}</p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                            : job.status === 'FAILED'
                            ? 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                            : 'bg-surface-subtle text-slate-300 border border-surface-border'
                        }`}
                      >
                        {job.status === 'COMPLETED' && <Check className="h-2.5 w-2.5" />}
                        {job.status === 'FAILED' && <AlertCircle className="h-2.5 w-2.5" />}
                        {job.status === 'PRINTING' && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
                        {job.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Configurações - Limpa com Avançadas Retrátil */}
        {activeTab === 'settings' && (
          <div className="space-y-3 w-full">
            <span className="text-xs font-semibold uppercase tracking-wider text-surface-muted block pt-0.5">
              Configurações
            </span>

            {/* Iniciar com o Sistema Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card p-4 w-full">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Power className="h-3.5 w-3.5 text-slate-400" />
                  Iniciar com o Sistema
                </div>
                <p className="text-[11px] text-surface-muted leading-snug">
                  Inicia em segundo plano ao ligar o computador.
                </p>
              </div>

              <button
                onClick={handleToggleAutostart}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  state.autostart ? 'bg-accent-600' : 'bg-surface-subtle'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    state.autostart ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Botão Retrátil: Configurações Avançadas */}
            <button
              type="button"
              onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
              className="w-full flex items-center justify-between rounded-xl border border-surface-border bg-surface-card hover:bg-surface-cardHover p-4 transition text-left group"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-subtle text-slate-400 border border-surface-border group-hover:text-slate-200">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Configurações Avançadas</h4>
                  <p className="text-[11px] text-surface-muted">Servidor HUB e Desvinculação do Terminal</p>
                </div>
              </div>
              {isAdvancedExpanded ? (
                <ChevronUp className="h-4 w-4 text-surface-muted group-hover:text-slate-200" />
              ) : (
                <ChevronDown className="h-4 w-4 text-surface-muted group-hover:text-slate-200" />
              )}
            </button>

            {/* Conteúdo Expandido de Configurações Avançadas */}
            {isAdvancedExpanded && (
              <div className="space-y-3 pt-1 w-full animate-fade-in">
                {/* 1. Endereço do Servidor HUB */}
                <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2.5 w-full">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <Server className="h-3.5 w-3.5 text-slate-400" />
                    Endereço do Servidor HUB (Socket.IO)
                  </div>
                  <p className="text-[11px] text-surface-muted leading-snug">
                    Backend responsável por despachar as impressões para este caixa.
                  </p>
                  <form onSubmit={handleTriggerSaveHubUrl} className="space-y-2 pt-0.5">
                    <input
                      type="text"
                      value={hubUrlInput}
                      onChange={(e) => setHubUrlInput(e.target.value)}
                      placeholder="http://localhost:3335"
                      className="w-full rounded-lg border border-surface-border bg-canvas-900 px-3 py-1.5 text-xs font-mono text-white focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                    <button
                      type="submit"
                      disabled={isSavingHub || hubUrlInput.trim() === state.hubUrl}
                      className="w-full rounded-lg bg-accent-600 hover:bg-accent-500 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
                    >
                      {isSavingHub ? 'Salvando...' : 'Salvar & Conectar'}
                    </button>
                  </form>
                </div>

                {/* 2. Desvincular Agente da Empresa */}
                <div className="rounded-xl border border-rose-900/30 bg-rose-950/10 p-4 space-y-2.5 w-full">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                    <Unlink className="h-3.5 w-3.5 text-rose-400" />
                    Desvincular deste Terminal
                  </div>
                  <p className="text-[11px] text-surface-muted leading-snug">
                    Gera um novo código IMP e cancela a associação deste agente com a empresa atual.
                  </p>

                  {showUnclaimConfirm ? (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] text-rose-300 font-medium block">Confirmar desvinculação?</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleUnclaim}
                          disabled={isUnclaiming}
                          className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-500 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                        >
                          {isUnclaiming ? 'Desvinculando...' : 'Sim, Desvincular'}
                        </button>
                        <button
                          onClick={() => setShowUnclaimConfirm(false)}
                          className="flex-1 rounded-lg border border-surface-border bg-surface-subtle hover:bg-surface-cardHover py-1.5 text-xs font-medium text-slate-300 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUnclaimConfirm(true)}
                      disabled={!state.company}
                      className="w-full rounded-lg border border-rose-500/30 bg-rose-950/30 hover:bg-rose-900/40 py-1.5 text-xs font-semibold text-rose-300 transition active:scale-95 disabled:opacity-50"
                    >
                      Desvincular Agente
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="flex items-center justify-around border-t border-surface-border bg-canvas-900/95 py-2 backdrop-blur-md shrink-0">
        <button
          onClick={() => setActiveTab('printers')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition ${
            activeTab === 'printers' ? 'text-accent-500 font-semibold' : 'text-surface-muted hover:text-slate-200'
          }`}
        >
          <Printer className="h-4 w-4" />
          <span className="text-[10px]">Impressoras</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition relative ${
            activeTab === 'history' ? 'text-accent-500 font-semibold' : 'text-surface-muted hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <History className="h-4 w-4" />
            {state.history.length > 0 && (
              <span className="absolute -top-1 -right-2 flex h-3 min-w-3 items-center justify-center rounded-full bg-accent-600 px-1 text-[8px] font-bold text-white">
                {state.history.length > 9 ? '9+' : state.history.length}
              </span>
            )}
          </div>
          <span className="text-[10px]">Histórico</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition ${
            activeTab === 'settings' ? 'text-accent-500 font-semibold' : 'text-surface-muted hover:text-slate-200'
          }`}
        >
          <Settings className="h-4 w-4" />
          <span className="text-[10px]">Ajustes</span>
        </button>
      </nav>

      {/* Modal: Confirmação de Alteração do Servidor HUB (Disparado APÓS clicar em salvar) */}
      {showConfirmHubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-[340px] rounded-2xl border border-surface-border bg-surface-card p-5 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Confirmar Alteração</h3>
                <p className="text-[10px] text-amber-400 font-medium">Servidor HUB (Socket.IO)</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>Você está alterando o endereço do HUB para:</p>
              <div className="rounded-lg border border-surface-border bg-canvas-900 px-3 py-2 text-xs font-mono text-accent-500 break-all select-text">
                {hubUrlInput}
              </div>
              <p className="text-[11px] text-amber-300">
                Esta ação desconectará o caixa do servidor atual e poderá interromper as impressões em andamento.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-surface-border">
              <button
                type="button"
                onClick={() => setShowConfirmHubModal(false)}
                className="flex-1 rounded-lg border border-surface-border bg-surface-subtle py-2 text-xs font-medium text-slate-300 hover:bg-surface-cardHover transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveHubUrl}
                disabled={isSavingHub}
                className="flex-1 rounded-lg bg-accent-600 hover:bg-accent-500 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                {isSavingHub ? 'Aplicando...' : 'Sim, Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Impressora de Rede TCP:9100 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-[340px] rounded-2xl border border-surface-border bg-surface-card p-4 shadow-2xl space-y-3.5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-accent-500" />
                <h3 className="text-xs font-semibold text-white">Cadastrar Impressora de Rede</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setTcpModalError(null);
                }}
                className="rounded-lg p-1 text-surface-muted hover:bg-surface-subtle hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddTcpPrinter} className="space-y-3">
              {tcpModalError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400 animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="leading-tight break-words">{tcpModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Nome da Impressora
                </label>
                <input
                  type="text"
                  required
                  value={tcpName}
                  onChange={(e) => {
                    setTcpName(e.target.value);
                    if (tcpModalError) setTcpModalError(null);
                  }}
                  placeholder="Ex: Térmica Balcão"
                  className="w-full rounded-lg border border-surface-border bg-canvas-900 px-3 py-1.5 text-xs text-white focus:border-accent-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    IP / Host
                  </label>
                  <input
                    type="text"
                    required
                    value={tcpHost}
                    onChange={(e) => {
                      setTcpHost(e.target.value);
                      if (tcpModalError) setTcpModalError(null);
                    }}
                    placeholder="192.168.1.200 ou localhost"
                    className="w-full rounded-lg border border-surface-border bg-canvas-900 px-3 py-1.5 text-xs font-mono text-white focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Porta</label>
                  <input
                    type="number"
                    required
                    value={tcpPort}
                    onChange={(e) => {
                      setTcpPort(Number(e.target.value));
                      if (tcpModalError) setTcpModalError(null);
                    }}
                    placeholder="9100"
                    className="w-full rounded-lg border border-surface-border bg-canvas-900 px-2 py-1.5 text-xs font-mono text-white focus:border-accent-500 focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[10px] text-surface-muted leading-tight">
                Porta padrão RAW/socket em térmicas (Epson, Bematech, Elgin) é <strong>9100</strong>.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setTcpModalError(null);
                  }}
                  className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface-cardHover"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTcp}
                  className="flex items-center gap-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  {isSavingTcp && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isSavingTcp ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modais de Atualização (Etapa 1: Download | Etapa 2: Reinicialização com 20s) */}
      {updatePrompt && updatePrompt.type === 'CONFIRM_DOWNLOAD' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-canvas-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400 shrink-0">
                <ArrowUpCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white">Nova Versão Disponível</h3>
                <p className="text-xs text-accent-400 font-semibold truncate">Versão v{updatePrompt.version}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Uma nova versão foi disponibilizada pelo Hub. Deseja iniciar o download em segundo plano agora? O caixa e as impressões não serão interrompidos.
            </p>

            <div className="flex items-center gap-2 pt-2 border-t border-surface-border">
              <button
                type="button"
                onClick={() => setUpdatePrompt(null)}
                className="flex-1 rounded-xl border border-surface-border bg-surface-subtle px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-surface-cardHover hover:text-white transition"
              >
                Lembrar Mais Tarde
              </button>
              <button
                type="button"
                onClick={handleConfirmDownloadUpdate}
                disabled={isDownloadingUpdate}
                className="flex-1 rounded-xl bg-accent-600 hover:bg-accent-500 text-white px-3 py-2 text-xs font-bold shadow-lg shadow-accent-600/20 transition flex items-center justify-center gap-1.5"
              >
                {isDownloadingUpdate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                )}
                Baixar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {updatePrompt && updatePrompt.type === 'CONFIRM_RESTART' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-canvas-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <ArrowUpCircle className="h-5 w-5 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white">Download Concluído</h3>
                <p className="text-xs text-emerald-400 font-semibold truncate">Versão v{updatePrompt.version} pronta</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              A atualização foi baixada com sucesso e está pronta. O aplicativo reiniciará em instantes para concluir a instalação de forma segura.
            </p>

            {/* Contador Regressivo de 20s */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center space-y-1.5">
              <div className="text-[11px] text-amber-300 font-medium">
                {updatePrompt.isPaused ? (
                  <span>Contador pausado. Reinicie quando desejar.</span>
                ) : (
                  <span>
                    Reiniciando em <strong className="text-amber-400 font-mono text-sm">{updatePrompt.secondsLeft}s</strong> (se ocioso)
                  </span>
                )}
              </div>
              <div className="w-full h-1.5 bg-canvas-950 rounded-full overflow-hidden border border-amber-500/20">
                <div
                  className="h-full bg-amber-500 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(updatePrompt.secondsLeft / 20) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-surface-border">
              <button
                type="button"
                onClick={() => setUpdatePrompt(null)}
                className="flex-1 rounded-xl border border-surface-border bg-surface-subtle px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-surface-cardHover hover:text-white transition"
              >
                Adiar / Lembrar Depois
              </button>
              <button
                type="button"
                onClick={() => handleAutoApplyUpdate(true)}
                disabled={isApplyingUpdate}
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-xs font-bold shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
              >
                {isApplyingUpdate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                )}
                Reiniciar Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
