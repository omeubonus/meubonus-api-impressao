import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { socketManager } from '../lib/socket';
import { PrintJob, Company, PrintJobStatus, SocketDashboardEvent } from '../types';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/Table';
import { Alert } from '../components/ui/Alert';
import { formatDate, formatTimeAgo } from '../lib/utils';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';

export function Jobs() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalJobs, setTotalJobs] = useState<number>(0);

  // Detail Modal
  const [detailJob, setDetailJob] = useState<PrintJob | null>(null);
  const [copiedDetailId, setCopiedDetailId] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getJobs({
        page,
        limit: 15,
        status: (selectedStatus as PrintJobStatus) || undefined,
        companyId: selectedCompany || undefined,
      });

      setJobs(response.data);
      setTotalPages(response.pagination.totalPages || 1);
      setTotalJobs(response.pagination.total || 0);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar histórico de impressões');
    } finally {
      setLoading(false);
    }
  }, [page, selectedStatus, selectedCompany]);

  useEffect(() => {
    api.getCompanies().then(setCompanies).catch(() => null);
  }, []);

  useEffect(() => {
    fetchJobs();

    const unsubscribe = socketManager.onDashboardUpdate((event: SocketDashboardEvent) => {
      if (event.type === 'new_print_job' || event.type === 'print_job_status') {
        // Atualiza a listagem silenciosamente
        fetchJobs();
      }
    });

    return unsubscribe;
  }, [fetchJobs]);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedDetailId(true);
    setTimeout(() => setCopiedDetailId(false), 2000);
  };

  const calculateDuration = (job: PrintJob) => {
    if (!job.startedAt || !job.completedAt) return '-';
    try {
      const start = new Date(job.startedAt).getTime();
      const end = new Date(job.completedAt).getTime();
      const diffMs = Math.max(0, end - start);
      if (diffMs < 1000) return `${diffMs}ms`;
      return `${(diffMs / 1000).toFixed(2)}s`;
    } catch {
      return '-';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Histórico de Impressões
          </h1>
          <p className="mt-0.5 text-xs text-surface-muted">
            Registro detalhado de todos os comandos de impressão enviados e executados pelos agentes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchJobs}
            isLoading={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" title="Erro">
          {error}
        </Alert>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
        {/* Status Filter */}
        <div className="w-full sm:w-52">
          <Select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os Status</option>
            <option value="QUEUED">QUEUED (Na Fila)</option>
            <option value="PRINTING">PRINTING (Imprimindo)</option>
            <option value="COMPLETED">COMPLETED (Concluído)</option>
            <option value="FAILED">FAILED (Falhou)</option>
          </Select>
        </div>

        {/* Company Filter */}
        <div className="w-full sm:w-64">
          <Select
            value={selectedCompany}
            onChange={(e) => {
              setSelectedCompany(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as Empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="ml-auto text-xs text-surface-muted font-mono">
          Total: <strong className="text-white">{totalJobs}</strong> trabalhos
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabalho / ID</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Agente / Impressora</TableHead>
              <TableHead>Formato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-surface-muted">
                  Carregando histórico de jobs...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-surface-muted">
                  Nenhum trabalho de impressão encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div>
                      <div className="font-semibold text-white truncate max-w-[200px]">
                        {job.title || 'Impressão'}
                      </div>
                      <div className="font-mono text-[11px] text-surface-muted">
                        #{job.id.slice(0, 8)}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-slate-300 font-medium">
                      {job.company?.name || <span className="text-surface-muted italic">Sem empresa</span>}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="text-xs">
                      <div className="font-mono text-accent-500 font-semibold">
                        {job.agent?.code || 'N/A'}
                      </div>
                      <div className="text-surface-muted truncate max-w-[150px] text-[11px]">
                        {job.printerName || 'Padrão'}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {job.type}
                    </Badge>
                  </TableCell>

                  <TableCell>
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
                    >
                      {job.status === 'COMPLETED' && <CheckCircle2 className="h-2.5 w-2.5 mr-1 inline" />}
                      {job.status === 'PRINTING' && <Clock className="h-2.5 w-2.5 mr-1 inline animate-spin" />}
                      {job.status === 'FAILED' && <AlertCircle className="h-2.5 w-2.5 mr-1 inline" />}
                      {job.status}
                    </Badge>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-300">
                    {calculateDuration(job)}
                  </TableCell>

                  <TableCell className="text-xs text-surface-muted" title={formatDate(job.createdAt)}>
                    {formatTimeAgo(job.createdAt)}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailJob(job)}
                      className="text-surface-muted hover:text-white"
                      title="Ver Detalhes Técnicos"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-surface-border bg-canvas-900/90 px-4 py-2.5">
          <div className="text-xs text-surface-muted">
            Página <strong className="text-white">{page}</strong> de{' '}
            <strong className="text-white">{totalPages}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-7.5 px-2.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-7.5 px-2.5 text-xs"
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Detalhes Técnicos do Job */}
      <Modal
        isOpen={!!detailJob}
        onClose={() => setDetailJob(null)}
        title="Detalhes do Trabalho de Impressão"
        description="Informações técnicas de execução, telemetria e carga útil (payload)."
        maxWidth="2xl"
      >
        {detailJob && (
          <div className="space-y-4 text-xs">
            {/* Header with status & copy ID */}
            <div className="flex items-center justify-between rounded-xl border border-surface-border bg-canvas-900/90 p-3">
              <div>
                <span className="text-[10px] text-surface-muted uppercase tracking-wider font-bold">
                  Job ID
                </span>
                <div className="flex items-center gap-2 font-mono text-xs text-accent-500 font-semibold select-all mt-0.5">
                  <span>{detailJob.id}</span>
                  <button
                    onClick={() => handleCopyId(detailJob.id)}
                    className="text-surface-muted hover:text-white"
                  >
                    {copiedDetailId ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <Badge
                variant={
                  detailJob.status === 'COMPLETED'
                    ? 'success'
                    : detailJob.status === 'FAILED'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {detailJob.status}
              </Badge>
            </div>

            {/* Error banner if failed */}
            {detailJob.errorMessage && (
              <Alert variant="destructive" title="Falha Reportada pelo Driver">
                {detailJob.errorMessage}
              </Alert>
            )}

            {/* Technical Metadata Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-surface-border bg-canvas-900/70 p-2.5">
                <span className="text-surface-muted block text-[10px] uppercase font-bold">
                  Empresa
                </span>
                <span className="font-semibold text-white truncate block mt-0.5">
                  {detailJob.company?.name || 'N/A'}
                </span>
              </div>
              <div className="rounded-xl border border-surface-border bg-canvas-900/70 p-2.5">
                <span className="text-surface-muted block text-[10px] uppercase font-bold">
                  Código do Agente
                </span>
                <span className="font-mono font-semibold text-accent-500 block mt-0.5">
                  {detailJob.agent?.code || 'N/A'}
                </span>
              </div>
              <div className="rounded-xl border border-surface-border bg-canvas-900/70 p-2.5">
                <span className="text-surface-muted block text-[10px] uppercase font-bold">
                  Impressora
                </span>
                <span className="font-semibold text-slate-200 truncate block mt-0.5">
                  {detailJob.printerName || 'Padrão'}
                </span>
              </div>
              <div className="rounded-xl border border-surface-border bg-canvas-900/70 p-2.5">
                <span className="text-surface-muted block text-[10px] uppercase font-bold">
                  Tipo / Formato
                </span>
                <span className="font-mono font-semibold text-amber-400 block mt-0.5">
                  {detailJob.type}
                </span>
              </div>
            </div>

            {/* Timestamps */}
            <div className="rounded-xl border border-surface-border bg-canvas-900/70 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-surface-muted">Criado em:</span>
                <span className="font-mono text-slate-200">{formatDate(detailJob.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-muted">Iniciado pelo Agente:</span>
                <span className="font-mono text-slate-200">{formatDate(detailJob.startedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-muted">Finalizado em:</span>
                <span className="font-mono text-slate-200">{formatDate(detailJob.completedAt)}</span>
              </div>
              <div className="flex justify-between border-t border-surface-border/80 pt-1.5 mt-1.5">
                <span className="text-surface-muted font-semibold">Tempo Total de Execução:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {calculateDuration(detailJob)}
                </span>
              </div>
            </div>

            {/* Payload Content Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-surface-muted font-medium">
                <span>Conteúdo da Impressão (Payload)</span>
                <span className="font-mono text-[11px] text-surface-muted">
                  {detailJob.content?.length || 0} caracteres
                </span>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded-xl border border-surface-border bg-canvas-900 p-3 font-mono text-[11px] text-slate-200 select-all whitespace-pre-wrap break-all">
                {detailJob.content}
              </pre>
            </div>

            {/* Options */}
            {detailJob.options && Object.keys(detailJob.options).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-surface-muted font-medium">Opções Avançadas</span>
                <pre className="rounded-xl border border-surface-border bg-canvas-900 p-2.5 font-mono text-[11px] text-surface-muted">
                  {JSON.stringify(detailJob.options, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-surface-border">
              <Button onClick={() => setDetailJob(null)}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
