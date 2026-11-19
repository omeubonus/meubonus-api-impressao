import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { socketManager } from '../lib/socket';
import { Agent, Company, SocketDashboardEvent } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { formatDate, formatTimeAgo } from '../lib/utils';
import {
  MonitorCheck,
  Search,
  RefreshCw,
  Printer,
  Building2,
  Copy,
  Check,
  Settings,
  Unlink,
  Link as LinkIcon,
  PlaySquare,
  AlertCircle,
  Laptop,
  ArrowUpCircle,
  Download,
  Loader2,
} from 'lucide-react';

function isVersionOutdated(agentVersion?: string | null, latestVersion?: string | null): boolean {
  if (!agentVersion || !latestVersion) return false;
  if (agentVersion.includes('dev')) return false;

  const clean = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [aMaj = 0, aMin = 0, aPatch = 0] = clean(agentVersion);
  const [lMaj = 0, lMin = 0, lPatch = 0] = clean(latestVersion);

  if (lMaj > aMaj) return true;
  if (lMaj === aMaj && lMin > aMin) return true;
  if (lMaj === aMaj && lMin === aMin && lPatch > aPatch) return true;
  return false;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function isAgentInactive(agent: Agent): boolean {
  if (agent.companyId !== null) return false;
  if (agent.status === 'ONLINE') return false;
  const lastActive = agent.lastSeenAt || agent.createdAt;
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() > TWO_HOURS_MS;
}

export function Agents() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'assigned' | 'unassigned'>('assigned');
  const [showInactiveUnassigned, setShowInactiveUnassigned] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [buildingVersion, setBuildingVersion] = useState<string | null>(null);
  const [installersReady, setInstallersReady] = useState<{ win: boolean; mac: boolean }>({ win: false, mac: false });
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'destructive' | 'info'; title?: string; message: string } | null>(null);

  // Modal Vincular Agente
  const [assignModalAgent, setAssignModalAgent] = useState<Agent | null>(null);
  const [targetCompanyId, setTargetCompanyId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Modal Desvincular Agente
  const [unclaimModalAgent, setUnclaimModalAgent] = useState<Agent | null>(null);
  const [unclaiming, setUnclaiming] = useState(false);

  // Modal Editar Agente / Impressora Padrão
  const [editModalAgent, setEditModalAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', defaultPrinter: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Confirmar Atualização (Individual ou Massa)
  const [updateConfirmModal, setUpdateConfirmModal] = useState<{
    open: boolean;
    agent?: Agent;
    isBulk?: boolean;
    count?: number;
  }>({ open: false });

  const showFeedback = (type: 'success' | 'warning' | 'destructive' | 'info', message: string, title?: string) => {
    setFeedback({ type, message, title });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 5000);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [agentsData, companiesData, downloadsData] = await Promise.all([
        api.getAgents(),
        api.getCompanies(),
        api.getDownloadsInfo().catch(() => null),
      ]);
      setAgents(agentsData);
      setCompanies(companiesData);
      if (downloadsData) {
        const hasAnyFile = Boolean(downloadsData.windows?.available || downloadsData.mac?.available);
        setInstallersReady({
          win: Boolean(downloadsData.windows?.available),
          mac: Boolean(downloadsData.mac?.available),
        });
        setBuildingVersion(downloadsData.buildingVersion || null);
        if (downloadsData.version && hasAnyFile) {
          setLatestVersion(downloadsData.version);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Escuta atualizações de WebSocket
    const unsubscribe = socketManager.onDashboardUpdate((event: SocketDashboardEvent) => {
      if (
        event.type === 'agent_status' ||
        event.type === 'agent_heartbeat' ||
        event.type === 'agent_assigned' ||
        event.type === 'agent_unclaimed' ||
        event.type === 'agent_updated' ||
        event.type === 'agent_printer_updated' ||
        (event.type as any) === 'agent_update_status'
      ) {
        // Atualiza a lista silenciosamente
        api.getAgents().then((updated) => setAgents(updated)).catch(() => null);
      }
    });

    return unsubscribe;
  }, [fetchData]);

  // Se houver uma versão do Desktop sendo compilada no GitHub Actions, reconsulta silenciosamente a cada 15s
  useEffect(() => {
    if (!buildingVersion) return;
    const interval = setInterval(() => {
      api.getDownloadsInfo()
        .then((downloadsData) => {
          if (!downloadsData) return;
          const hasAnyFile = Boolean(downloadsData.windows?.available || downloadsData.mac?.available);
          setInstallersReady({
            win: Boolean(downloadsData.windows?.available),
            mac: Boolean(downloadsData.mac?.available),
          });
          setBuildingVersion(downloadsData.buildingVersion || null);
          if (downloadsData.version && hasAnyFile) {
            setLatestVersion(downloadsData.version);
          }
        })
        .catch(() => null);
    }, 15000);
    return () => clearInterval(interval);
  }, [buildingVersion]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleOpenAssignModal = (agent: Agent) => {
    setAssignModalAgent(agent);
    setTargetCompanyId(companies[0]?.id || '');
  };

  const handleConfirmAssign = async () => {
    if (!assignModalAgent || !targetCompanyId) return;
    setAssigning(true);
    try {
      await api.assignAgent(assignModalAgent.id, targetCompanyId);
      setAssignModalAgent(null);
      showFeedback('success', `Agente ${assignModalAgent.code} vinculado com sucesso!`);
      fetchData();
    } catch (err: any) {
      showFeedback('destructive', err.message || 'Erro ao vincular agente', 'Falha no Vínculo');
    } finally {
      setAssigning(false);
    }
  };

  const handleOpenUnclaimModal = (agent: Agent) => {
    setUnclaimModalAgent(agent);
  };

  const handleConfirmUnclaim = async () => {
    if (!unclaimModalAgent) return;
    setUnclaiming(true);
    try {
      await api.unclaimAgent(unclaimModalAgent.id);
      const code = unclaimModalAgent.code;
      setUnclaimModalAgent(null);
      showFeedback('info', `Agente ${code} desvinculado. Um novo código de ativação foi gerado.`);
      fetchData();
    } catch (err: any) {
      showFeedback('destructive', err.message || 'Erro ao desvincular agente', 'Falha ao Desvincular');
    } finally {
      setUnclaiming(false);
    }
  };

  const handleOpenEditModal = (agent: Agent) => {
    setEditModalAgent(agent);
    setEditForm({
      name: agent.name || '',
      defaultPrinter: agent.defaultPrinter || '',
    });
  };

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalAgent) return;
    setSavingEdit(true);
    try {
      await api.updateAgent(editModalAgent.id, editForm);
      setEditModalAgent(null);
      showFeedback('success', 'Configurações do agente salvas com sucesso.');
      fetchData();
    } catch (err: any) {
      showFeedback('destructive', err.message || 'Erro ao atualizar dados do agente');
    } finally {
      setSavingEdit(false);
    }
  };

  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);

  const handleTestPrint = (agent: Agent) => {
    navigate(`/painel/playground?agentId=${agent.id}`);
  };

  const handleRequestUpdate = (agent: Agent) => {
    setUpdateConfirmModal({
      open: true,
      agent,
      isBulk: false,
    });
  };

  const isAgentUpdateReady = useCallback(
    (agent: Agent) => {
      if (!isVersionOutdated(agent.version, latestVersion)) return false;
      const osLower = (agent.os || '').toLowerCase();
      if (osLower.includes('darwin') || osLower.includes('mac')) {
        return installersReady.mac;
      }
      if (osLower.includes('win')) {
        return installersReady.win;
      }
      return installersReady.win || installersReady.mac;
    },
    [latestVersion, installersReady]
  );

  const handleRequestBulkUpdate = () => {
    if (!latestVersion) return;
    const count = agents.filter(
      (a) => a.status === 'ONLINE' && isAgentUpdateReady(a)
    ).length;

    if (count === 0) {
      showFeedback('info', 'Todos os agentes online já estão na versão mais recente disponível!');
      return;
    }

    setUpdateConfirmModal({
      open: true,
      isBulk: true,
      count,
    });
  };

  const handleExecuteConfirmedUpdate = async () => {
    if (updateConfirmModal.isBulk) {
      try {
        setIsBulkUpdating(true);
        setUpdateConfirmModal({ open: false });
        const res = await api.triggerUpdateAllAgents(false);
        showFeedback('success', res.message || `Comando enviado para ${res.triggeredCount} agente(s).`, 'Atualização em Andamento');
        fetchData();
      } catch (err: any) {
        showFeedback('destructive', err.message || 'Erro ao disparar atualização em massa', 'Falha');
      } finally {
        setIsBulkUpdating(false);
      }
    } else if (updateConfirmModal.agent) {
      const agent = updateConfirmModal.agent;
      try {
        setUpdatingAgentId(agent.id);
        setUpdateConfirmModal({ open: false });
        const res = await api.triggerAgentUpdate(agent.id, false);
        if (res.success) {
          showFeedback('success', `Comando de atualização enviado para o agente ${agent.code}! Download iniciado em segundo plano.`, 'Atualização Solicitada');
        } else if (res.reason === 'BUSY_PRINTING') {
          showFeedback('warning', `O agente ${agent.code} está imprimindo no momento. A atualização será aplicada assim que a fila estiver ociosa.`, 'Impressora Ocupada');
        } else {
          showFeedback('info', res.message || 'Comando de atualização processado.');
        }
        fetchData();
      } catch (err: any) {
        showFeedback('destructive', err.message || 'Erro ao enviar comando de atualização', 'Falha no Comando');
      } finally {
        setUpdatingAgentId(null);
      }
    }
  };

  const outdatedOnlineAgents = agents.filter(
    (a) => a.status === 'ONLINE' && isAgentUpdateReady(a)
  );

  // Separação por aba
  const assignedAgents = agents.filter((a) => a.companyId !== null);
  const unassignedAgents = agents.filter((a) => a.companyId === null);
  const activeUnassignedAgents = unassignedAgents.filter((a) => !isAgentInactive(a));
  const inactiveUnassignedCount = unassignedAgents.length - activeUnassignedAgents.length;

  const isSearching = search.trim().length > 0;

  const displayedAgents = (activeTab === 'assigned' ? assignedAgents : unassignedAgents)
    .filter((agent) => {
      // Na aba "Sem Empresa Vinculada", oculta inativos (>2h) se o toggle estiver desmarcado e NÃO houver busca ativa
      if (activeTab === 'unassigned' && !showInactiveUnassigned && !isSearching) {
        if (isAgentInactive(agent)) return false;
      }

      const matchSearch =
        agent.code.toLowerCase().includes(search.toLowerCase()) ||
        (agent.name && agent.name.toLowerCase().includes(search.toLowerCase())) ||
        (agent.hostname && agent.hostname.toLowerCase().includes(search.toLowerCase())) ||
        (agent.company?.name && agent.company.name.toLowerCase().includes(search.toLowerCase()));

      const matchCompany =
        !selectedCompanyFilter || agent.companyId === selectedCompanyFilter;

      return matchSearch && (activeTab === 'unassigned' || matchCompany);
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Agentes de Impressão
          </h1>
          <p className="mt-0.5 text-xs text-surface-muted">
            Monitore computadores locais com SilentPrint Agent instalado e suas impressoras.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {buildingVersion && (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500/30 bg-accent-500/10 px-2.5 py-1.5 text-[11px] font-medium text-accent-300"
              title="Uma nova versão do Agente Desktop está sendo compilada no GitHub Actions. A atualização será liberada automaticamente assim que os instaladores estiverem prontos."
            >
              <Loader2 className="h-3 w-3 animate-spin text-accent-400" />
              Compilando v{buildingVersion}...
            </span>
          )}
          {outdatedOnlineAgents.length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleRequestBulkUpdate}
              disabled={isBulkUpdating}
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-md shadow-amber-600/25 border-0"
              title={`Disparar atualização segura em segundo plano para todos os ${outdatedOnlineAgents.length} agente(s) online`}
            >
              <ArrowUpCircle className={`h-3.5 w-3.5 mr-1.5 ${isBulkUpdating ? 'animate-spin' : ''}`} />
              Atualizar Todos ({outdatedOnlineAgents.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/download', '_blank')}
            className="text-xs"
            title="Abrir página pública de download do agente desktop"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-accent-500" />
            Baixar Instalador
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            isLoading={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Inline Feedback Banner (Auto-dismisses) */}
      {feedback && (
        <Alert variant={feedback.type} title={feedback.title} className="transition-all animate-fadeIn">
          {feedback.message}
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" title="Erro">
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as any)}
        tabs={[
          {
            id: 'assigned',
            label: 'Agentes Vinculados',
            badge: assignedAgents.length,
            icon: <MonitorCheck className="h-4 w-4" />,
          },
          {
            id: 'unassigned',
            label: 'Sem Empresa Vinculada',
            badge: activeUnassignedAgents.length,
            icon: <AlertCircle className="h-4 w-4" />,
          },
        ]}
      />

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-surface-muted" />
          <Input
            placeholder="Buscar por código IMP-XXXXXX, nome ou hostname..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {activeTab === 'assigned' && (
          <div className="w-full sm:w-64">
            <Select
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
            >
              <option value="">Todas as Empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {activeTab === 'unassigned' && inactiveUnassignedCount > 0 && (
          <label className="flex items-center gap-2 cursor-pointer text-xs text-surface-muted hover:text-white select-none px-3 py-2 rounded-lg border border-surface-border bg-canvas-900/60 transition-colors shrink-0">
            <input
              type="checkbox"
              checked={showInactiveUnassigned}
              onChange={(e) => setShowInactiveUnassigned(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-surface-border bg-canvas-800 text-accent-500 focus:ring-accent-500/20 cursor-pointer accent-accent-500"
            />
            <span>Mostrar inativos (&gt;2h)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-surface-card border border-surface-border text-amber-400 font-medium">
              {inactiveUnassignedCount}
            </span>
          </label>
        )}
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-surface-muted text-xs">
          <RefreshCw className="h-5 w-5 animate-spin mr-2 text-accent-500" />
          Carregando agentes...
        </div>
      ) : displayedAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-border py-14 text-center text-surface-muted">
          <MonitorCheck className="h-10 w-10 text-surface-muted mb-2 opacity-50" />
          <h3 className="text-sm font-semibold text-white">Nenhum agente encontrado</h3>
          <p className="mt-1 text-xs text-surface-muted max-w-sm">
            {activeTab === 'unassigned' ? (
              inactiveUnassignedCount > 0 && !showInactiveUnassigned && !isSearching ? (
                <span>
                  Existem {inactiveUnassignedCount} agente(s) inativo(s) há mais de 2h.{' '}
                  <button
                    type="button"
                    onClick={() => setShowInactiveUnassigned(true)}
                    className="text-accent-400 underline hover:text-accent-300 ml-1 font-medium inline-block"
                  >
                    Exibir inativos
                  </button>
                </span>
              ) : (
                'Não há agentes recém-instalados aguardando vínculo no momento.'
              )
            ) : (
              'Nenhum agente vinculado com os filtros selecionados.'
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedAgents.map((agent) => {
            const isOnline = agent.status === 'ONLINE';
            const isCopied = copiedCode === agent.code;
            const printersList: any[] = Array.isArray(agent.printers) ? agent.printers : [];
            const isOutdated = isAgentUpdateReady(agent);

            return (
              <Card
                key={agent.id}
                className="flex flex-col border-surface-border bg-surface-card hover:border-surface-cardHover shadow-sm"
              >
                <CardHeader className="pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    {/* Código e Cópia */}
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-white bg-canvas-900 px-2 py-0.5 rounded border border-surface-border select-all">
                        {agent.code}
                      </span>
                      <button
                        onClick={() => handleCopyCode(agent.code)}
                        className="text-surface-muted hover:text-accent-500 transition-colors p-0.5"
                        title="Copiar código"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Status e Versão */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {isAgentInactive(agent) && (
                        <Badge variant="warning" className="text-[10px] py-0 px-1.5 font-medium tracking-normal" title="Sem comunicação há mais de 2 horas">
                          Inativo (&gt;2h)
                        </Badge>
                      )}
                      {agent.version && (
                        <span className="font-mono text-[11px] text-surface-muted bg-canvas-900/80 px-1.5 py-0.5 rounded border border-surface-border">
                          v{agent.version}
                        </span>
                      )}
                      <Badge variant={isOnline ? 'success' : 'secondary'} className="text-[10px] py-0 px-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full mr-1 ${
                            isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                          }`}
                        />
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </Badge>
                    </div>
                  </div>

                  {/* Nome amigável ou Hostname */}
                  <div className="mt-2">
                    <CardTitle className="text-sm font-bold text-white truncate" title={agent.name || agent.hostname || 'Agente'}>
                      {agent.name || agent.hostname || 'Agente Sem Nome'}
                    </CardTitle>
                    {agent.name && agent.hostname && (
                      <p className="text-[11px] text-surface-muted truncate mt-0.5 flex items-center gap-1">
                        <Laptop className="h-3 w-3 shrink-0 opacity-70" />
                        {agent.hostname} {agent.os ? `(${agent.os})` : ''}
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-2 pb-3 text-xs">
                  {/* Linha Empresa */}
                  <div className="flex items-center justify-between py-1 border-b border-surface-border/50 text-surface-muted">
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      Empresa
                    </span>
                    {agent.company ? (
                      <span className="font-semibold text-accent-400 text-xs truncate max-w-[160px]" title={agent.company.name}>
                        {agent.company.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleOpenAssignModal(agent)}
                        className="text-amber-400 hover:text-amber-300 font-semibold text-xs flex items-center gap-1"
                      >
                        <LinkIcon className="h-3 w-3" />
                        Vincular
                      </button>
                    )}
                  </div>

                  {/* Linha Impressora Padrão */}
                  <div className="flex items-center justify-between py-1 border-b border-surface-border/50 text-surface-muted">
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <Printer className="h-3.5 w-3.5 text-slate-400" />
                      Impressora
                    </span>
                    <div className="flex items-center gap-1 max-w-[170px]">
                      {agent.defaultPrinter ? (
                        <span className="font-mono text-emerald-400 text-xs truncate" title={agent.defaultPrinter}>
                          {agent.defaultPrinter}
                        </span>
                      ) : (
                        <span className="italic text-surface-muted text-xs truncate">
                          {printersList.length > 0 ? `${printersList.length} detectada(s)` : 'Nenhuma'}
                        </span>
                      )}
                      <button
                        onClick={() => handleOpenEditModal(agent)}
                        className="text-surface-muted hover:text-white p-0.5 ml-0.5"
                        title="Configurar impressora padrão"
                      >
                        <Settings className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Linha Visto por Último */}
                  <div className="flex items-center justify-between text-[11px] text-surface-muted pt-0.5">
                    <span>Visto:</span>
                    <span className="font-mono text-slate-400" title={formatDate(agent.lastSeenAt)}>
                      {formatTimeAgo(agent.lastSeenAt)}
                    </span>
                  </div>

                  {/* Alerta de Atualização Pendente */}
                  {isOutdated && isOnline && (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] flex items-center justify-between text-amber-300">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>Nova versão <strong>v{latestVersion}</strong> disponível</span>
                      </div>
                    </div>
                  )}

                  {/* Status de Atualização Remota em Andamento / Concluída */}
                  {agent.updateStatus && agent.updateStatus !== 'IDLE' && (
                    <div className={`mt-2 rounded-lg border p-2 text-xs flex items-center justify-between ${
                      agent.updateStatus === 'ERROR'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : agent.updateStatus === 'DOWNLOADED'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-accent-500/30 bg-accent-500/10 text-accent-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        {agent.updateStatus === 'DOWNLOADING' || agent.updateStatus === 'CHECKING' ? (
                          <Loader2 className="h-3.5 w-3.5 text-accent-400 animate-spin" />
                        ) : agent.updateStatus === 'ERROR' ? (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                        ) : (
                          <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-400" />
                        )}
                        <span className="font-medium text-[11px]">
                          {agent.updateStatus === 'CHECKING'
                            ? 'Verificando atualizações...'
                            : agent.updateStatus === 'PROMPT_DOWNLOAD'
                            ? 'Aguardando operador confirmar download no PDV...'
                            : agent.updateStatus === 'DOWNLOADING'
                            ? `Baixando atualização (${agent.downloadProgress || 0}%)...`
                            : agent.updateStatus === 'DOWNLOADED'
                            ? 'Download concluído! Pronto para reiniciar.'
                            : agent.updateStatus === 'ERROR'
                            ? 'Falha na atualização'
                            : agent.updateStatus}
                        </span>
                      </div>
                      {agent.updateStatus === 'DOWNLOADED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => api.triggerAgentUpdate(agent.id, true).then(() => fetchData())}
                          className="h-5 text-[10px] px-2 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20"
                          title="Reiniciar agora imediatamente sem aguardar ociosidade"
                        >
                          Reiniciar
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>

                {/* Footer Actions */}
                <div className="border-t border-surface-border p-2.5 flex items-center justify-between gap-2 bg-canvas-900/50 rounded-b-2xl">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestPrint(agent)}
                    disabled={!isOnline}
                    className="flex-1 text-xs h-7"
                    title={isOnline ? 'Enviar teste' : 'Agente offline'}
                  >
                    <PlaySquare className="h-3.5 w-3.5 mr-1 text-accent-500" />
                    Testar
                  </Button>

                  {isOnline && isOutdated ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleRequestUpdate(agent)}
                      disabled={updatingAgentId === agent.id}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-2.5 h-7 shadow-sm border-0"
                      title={`Atualizar agente para v${latestVersion} (seguro para o PDV)`}
                    >
                      <ArrowUpCircle className={`h-3.5 w-3.5 mr-1 ${updatingAgentId === agent.id ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  ) : isOnline ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRequestUpdate(agent)}
                      disabled={updatingAgentId === agent.id}
                      className="text-surface-muted hover:text-accent-500 hover:bg-accent-500/10 px-2 h-7"
                      title="Checar / solicitar atualização remota"
                    >
                      <ArrowUpCircle className={`h-3.5 w-3.5 ${updatingAgentId === agent.id ? 'animate-spin text-accent-500' : ''}`} />
                    </Button>
                  ) : null}

                  {agent.companyId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenUnclaimModal(agent)}
                      className="text-surface-muted hover:text-rose-400 hover:bg-rose-950/20 px-2 h-7"
                      title="Desvincular agente da empresa"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleOpenAssignModal(agent)}
                      className="text-xs px-2.5 h-7"
                    >
                      <LinkIcon className="h-3.5 w-3.5 mr-1" />
                      Vincular
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Confirmar Atualização (Individual ou Massa) */}
      <Modal
        isOpen={updateConfirmModal.open}
        onClose={() => setUpdateConfirmModal({ open: false })}
        title={updateConfirmModal.isBulk ? 'Atualizar Todos os Agentes?' : 'Atualizar Agente de Impressão?'}
        description={
          updateConfirmModal.isBulk
            ? `Enviar comando de atualização remota para ${updateConfirmModal.count} agente(s) online.`
            : `Enviar comando de atualização remota para o agente ${updateConfirmModal.agent?.code}.`
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-border bg-canvas-900/80 p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-accent-400 font-semibold">
              <ArrowUpCircle className="h-4 w-4" />
              <span>Versão de destino: v{latestVersion}</span>
            </div>
            <p className="text-surface-muted leading-relaxed">
              O agente receberá o comando imediatamente, baixará a atualização em segundo plano e solicitará a reinicialização sem interromper impressões em andamento.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUpdateConfirmModal({ open: false })}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-sm border-0"
              onClick={handleExecuteConfirmedUpdate}
            >
              <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
              Confirmar Atualização
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Vincular Agente */}
      <Modal
        isOpen={!!assignModalAgent}
        onClose={() => setAssignModalAgent(null)}
        title="Vincular Agente à Empresa"
        description={`Selecione a empresa proprietária para o agente ${assignModalAgent?.code}.`}
      >
        <div className="space-y-4">
          <Select
            label="Empresa Destino"
            value={targetCompanyId}
            onChange={(e) => setTargetCompanyId(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </option>
            ))}
          </Select>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignModalAgent(null)}
              disabled={assigning}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmAssign} isLoading={assigning}>
              Confirmar Vínculo
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Desvincular Agente */}
      <Modal
        isOpen={!!unclaimModalAgent}
        onClose={() => setUnclaimModalAgent(null)}
        title="Desvincular Agente?"
        description="Esta ação removerá o vínculo da empresa e gerará um novo código IMP-XXXXXX."
      >
        <div className="space-y-4">
          <Alert variant="warning">
            O agente <strong>{unclaimModalAgent?.code}</strong> perderá o acesso às impressões da
            empresa <strong>{unclaimModalAgent?.company?.name}</strong>. Um novo código de
            reivindicação será gerado e enviado ao agente imediatamente.
          </Alert>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUnclaimModalAgent(null)}
              disabled={unclaiming}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmUnclaim}
              isLoading={unclaiming}
            >
              Desvincular Agora
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Editar Agente / Impressora Padrão */}
      <Modal
        isOpen={!!editModalAgent}
        onClose={() => setEditModalAgent(null)}
        title="Configurações do Agente"
        description={`Atualize o apelido e a impressora padrão do agente ${editModalAgent?.code}.`}
      >
        {editModalAgent && (
          <form onSubmit={handleConfirmEdit} className="space-y-4">
            <Input
              label="Nome / Identificador do Agente"
              placeholder="Ex: Recepção Térreo ou Cozinha"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            <Select
              label="Impressora Padrão"
              value={editForm.defaultPrinter}
              onChange={(e) => setEditForm((prev) => ({ ...prev, defaultPrinter: e.target.value }))}
            >
              <option value="">Selecione ou deixe sem padrão</option>
              {Array.isArray(editModalAgent.printers) &&
                editModalAgent.printers.map((p: any, idx: number) => {
                  const printerName = typeof p === 'string' ? p : p.name;
                  return (
                    <option key={idx} value={printerName}>
                      {printerName}
                    </option>
                  );
                })}
            </Select>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditModalAgent(null)}
                disabled={savingEdit}
              >
                Cancelar
              </Button>
              <Button type="submit" isLoading={savingEdit}>
                Salvar Alterações
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
