import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { socketManager } from '../lib/socket';
import { DashboardStats, PrintJob, Agent, SocketDashboardEvent } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { formatDate, formatTimeAgo } from '../lib/utils';
import {
  Building2,
  MonitorCheck,
  Clock,
  Printer,
  AlertTriangle,
  PlaySquare,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsData, jobsData, agentsData] = await Promise.all([
        api.getStats(),
        api.getJobs({ limit: 6 }),
        api.getAgents(),
      ]);
      setStats(statsData);
      setRecentJobs(jobsData.data);
      setAgents(agentsData);
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    // Inscrição ao WebSocket
    const unsubscribe = socketManager.onDashboardUpdate((event: SocketDashboardEvent) => {
      // Atualizações otimistas ou rápidas no status dos agentes
      if (event.type === 'agent_status' && event.agent?.id) {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent.id
              ? { ...a, status: event.agent.status, lastSeenAt: new Date().toISOString() }
              : a
          )
        );
      }

      // Atualiza métricas, agentes e trabalhos em tempo real
      fetchDashboardData();
    });

    return unsubscribe;
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Dashboard Administrativo
          </h1>
          <p className="mt-0.5 text-xs text-surface-muted">
            Acompanhamento em tempo real da infraestrutura de impressão distribuída.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={refreshing}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
          <Link to="/painel/playground">
            <Button size="sm" className="gap-1.5">
              <PlaySquare className="h-3.5 w-3.5" />
              Testar Impressão
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Empresas */}
        <Card className="border-surface-border bg-surface-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
              Total de Empresas
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-subtle border border-surface-border text-slate-300">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white tracking-tight">
            {loading ? '-' : stats?.companies.total || 0}
          </div>
          <p className="mt-0.5 text-[11px] text-surface-muted">Tenants cadastrados na plataforma</p>
        </Card>

        {/* Agentes Online */}
        <Card className="border-surface-border bg-surface-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
              Agentes Conectados
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400">
              <MonitorCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-400 tracking-tight">
              {loading ? '-' : stats?.agents.online || 0}
            </span>
            <span className="text-xs text-surface-muted">
              / {loading ? '-' : stats?.agents.total || 0} total
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-surface-muted">
            {stats?.agents.offline || 0} offline no momento
          </p>
        </Card>

        {/* Agentes Sem Vínculo */}
        <Card className="border-surface-border bg-surface-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
              Aguardando Vínculo
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400 tracking-tight">
            {loading ? '-' : stats?.agents.unassigned || 0}
          </div>
          <p className="mt-0.5 text-[11px] text-surface-muted">
            Agentes com código IMP pendente
          </p>
        </Card>

        {/* Impressões 24h & Fila */}
        <Card className="border-surface-border bg-surface-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
              Impressões (24h)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-950/40 border border-accent-500/30 text-accent-400">
              <Printer className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-white tracking-tight">
              {loading ? '-' : stats?.jobs.last24h || 0}
            </span>
            <Badge variant={stats?.jobs.queued ? 'warning' : 'secondary'}>
              {stats?.jobs.queued || 0} na fila
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-surface-muted">
            <span className="text-emerald-400 font-semibold">{stats?.jobs.completed || 0} ok</span>
            <span>•</span>
            <span className="text-rose-400 font-semibold">{stats?.jobs.failed || 0} falhas</span>
          </div>
        </Card>
      </div>

      {/* Main Content Grid: Agentes (Maior - 2 cols) & Trabalhos Recentes (Menor - 1 col) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Status dos Agentes (Maior: 2 cols) */}
        <Card className="lg:col-span-2 border-surface-border bg-surface-card flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <div className="flex items-center gap-2">
                <MonitorCheck className="h-4 w-4 text-emerald-400" />
                <CardTitle className="text-sm font-bold">Status dos Agentes</CardTitle>
                <Badge variant="outline" className="font-mono text-[9px] ml-1">
                  {agents.filter((a) => a.status === 'ONLINE').length}/{agents.length} online
                </Badge>
              </div>
              <CardDescription className="mt-0.5">
                Monitoramento em tempo real dos terminais instalados
              </CardDescription>
            </div>
            <Link to="/painel/agents">
              <Button variant="ghost" size="sm" className="gap-1 text-accent-500 hover:text-accent-400">
                Ver todos
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            {agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-surface-border bg-surface-subtle/30">
                <MonitorCheck className="h-8 w-8 text-surface-muted mb-2 opacity-50" />
                <p className="text-xs font-semibold text-white">Nenhum agente registrado</p>
                <p className="text-[11px] text-surface-muted mt-0.5 max-w-sm">
                  Instale o aplicativo Desktop nos computadores dos clientes para iniciar a impressão silenciosa.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                {agents
                  .slice()
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((agent) => {
                  const isOnline = agent.status === 'ONLINE';
                  return (
                    <div
                      key={agent.id}
                      className="rounded-xl border border-surface-border bg-canvas-900/90 p-3 text-xs transition hover:border-surface-cardHover flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        {/* Identificador com LED */}
                        <div className="flex items-center gap-2 min-w-0">
                          {/* LED Indicador */}
                          <div className="relative flex items-center justify-center shrink-0">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isOnline
                                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                  : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                              }`}
                            />
                            {isOnline && (
                              <span className="absolute h-2 w-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
                            )}
                          </div>

                          <span className="font-mono text-xs font-bold text-white bg-surface-card px-2 py-0.5 rounded border border-surface-border select-all shrink-0">
                            {agent.code}
                          </span>

                          {(agent.name || agent.hostname) && (
                            <span
                              className="text-xs text-slate-200 font-semibold truncate"
                              title={agent.name || agent.hostname || ''}
                            >
                              {agent.name || agent.hostname}
                            </span>
                          )}
                        </div>

                        {/* Status Online/Offline Text */}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider shrink-0 rounded px-1.5 py-0.2 border ${
                            isOnline
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>

                      {/* Linha Inferior: Nome da Empresa Vinculada e Última Conexão */}
                      <div className="flex items-center justify-between gap-2 border-t border-surface-border/60 pt-2 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0 text-surface-muted">
                          <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                          {agent.company?.name ? (
                            <span className="truncate text-slate-300 font-medium">
                              {agent.company.name}
                            </span>
                          ) : (
                            <span className="text-amber-400 font-medium">
                              Aguardando vínculo
                            </span>
                          )}
                        </div>

                        {agent.lastSeenAt && (
                          <span
                            className="text-[10px] text-surface-muted shrink-0 font-mono"
                            title={formatDate(agent.lastSeenAt)}
                          >
                            {formatTimeAgo(agent.lastSeenAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trabalhos Recentes (Menor: 1 col) */}
        <Card className="lg:col-span-1 border-surface-border bg-surface-card flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-bold">Trabalhos Recentes</CardTitle>
              <CardDescription className="mt-0.5">Últimas impressões enviadas</CardDescription>
            </div>
            <Link to="/painel/jobs">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-accent-500 hover:text-accent-400 gap-1">
                Ver todos
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            {recentJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-surface-border bg-surface-subtle/30">
                <Printer className="h-8 w-8 text-surface-muted mb-2 opacity-50" />
                <p className="text-xs font-semibold text-white">Nenhum trabalho registrado</p>
                <Link to="/painel/playground" className="mt-2">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    Disparar teste
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-surface-border bg-canvas-900/90 p-2.5 text-xs transition hover:border-surface-cardHover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate text-xs">
                          {job.title || 'Impressão'}
                        </p>
                        <span className="font-mono text-[10px] text-surface-muted">
                          #{job.id.slice(0, 8)} • <strong className="text-accent-500 font-medium">{job.type}</strong>
                        </span>
                      </div>
                      <Badge
                        variant={
                          job.status === 'COMPLETED'
                            ? 'success'
                            : job.status === 'FAILED'
                            ? 'destructive'
                            : job.status === 'PRINTING'
                            ? 'warning'
                            : 'secondary'
                        }
                        className="text-[9px] shrink-0"
                      >
                        {job.status === 'COMPLETED' && <CheckCircle2 className="h-2.5 w-2.5 mr-1 inline" />}
                        {job.status === 'PRINTING' && <Clock className="h-2.5 w-2.5 mr-1 inline animate-spin" />}
                        {job.status}
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-surface-border/60 pt-1.5 text-[10px] text-surface-muted">
                      <span className="truncate" title={job.company?.name || 'N/A'}>
                        {job.company?.name || 'Sem empresa'}
                      </span>
                      <span className="shrink-0 font-mono text-surface-muted" title={formatDate(job.createdAt)}>
                        {formatTimeAgo(job.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
