import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { socketManager } from '../lib/socket';
import { Agent, PrintJobType, PrintJobStatus, SocketDashboardEvent } from '../types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import {
  PlaySquare,
  Printer,
  Sparkles,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface PrintTemplate {
  name: string;
  type: PrintJobType;
  title: string;
  content: string;
  options?: any;
}

const TEMPLATES: PrintTemplate[] = [
  {
    name: '🍽️ Comanda de Cozinha (RAW / ESC-POS)',
    type: 'RAW',
    title: 'Comanda #1042 - Cozinha',
    content: `================================\n` +
      `    RESTAURANTE SILENTPRINT     \n` +
      `    MESA 04 - COMANDA #1042     \n` +
      `================================\n` +
      `1x Pizza Margherita Especial\n` +
      `   * Sem cebola, massa crocante\n` +
      `2x Refrigerante Cola Lata 350ml\n` +
      `1x Sobremesa Petit Gateau\n` +
      `--------------------------------\n` +
      `Total: R$ 89,90\n` +
      `--------------------------------\n` +
      `Data: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n\n`,
  },
  {
    name: '🏷️ Etiqueta de Envio / Código (TEXT)',
    type: 'TEXT',
    title: 'Etiqueta Pacote #SP-8831',
    content: `========================================\n` +
      `       SILENTPRINT LOGISTICA BRASIL     \n` +
      `========================================\n` +
      `DESTINATARIO: Tech Solutions SA\n` +
      `ENDERECO: Av. Paulista, 1000 - 14o Andar\n` +
      `CIDADE: Sao Paulo - SP | CEP: 01310-100\n` +
      `----------------------------------------\n` +
      `RASTREAMENTO: [ BR-8831-9920-SP ]\n` +
      `PESO ESTIMADO: 1.250 kg | VOL: 1/1\n` +
      `DATA: ${new Date().toLocaleDateString('pt-BR')}\n` +
      `========================================\n\n\n`,
  },
  {
    name: '🧾 Recibo de Pagamento (HTML)',
    type: 'HTML',
    title: 'Comprovante Fiscal #9021',
    content: `<div style="font-family: monospace; max-width: 300px; padding: 10px;">
  <h2 style="text-align: center; margin: 0;">SILENTPRINT HUB</h2>
  <p style="text-align: center; font-size: 11px; margin: 4px 0;">CNPJ: 00.000.000/0001-99</p>
  <hr style="border-top: 1px dashed #000;"/>
  <p><strong>CUPOM DE VENDA</strong></p>
  <p>Item 1: Servico de Impressao Nuvem ... R$ 120,00</p>
  <p>Item 2: Licenca Agente SilentPrint ..... R$ 50,00</p>
  <hr style="border-top: 1px dashed #000;"/>
  <p style="text-align: right;"><strong>TOTAL: R$ 170,00</strong></p>
  <p style="font-size: 10px; text-align: center;">Obrigado pela preferencia!</p>
</div>`,
  },
  {
    name: '📄 Teste de Alinhamento e Grade (TEXT)',
    type: 'TEXT',
    title: 'Teste de Grade e Colunas',
    content: `------------------------------------------------\n` +
      `TESTE DE ALINHAMENTO DE CARACTERES E COLUNAS    \n` +
      `------------------------------------------------\n` +
      `CODIGO     DESCRICAO               QTD   VALOR  \n` +
      `001        Teclado Mecanico RGB    01    299,00 \n` +
      `002        Mouse Sem Fio 2.4Ghz    02    140,00 \n` +
      `003        Headset Gamer 7.1       01    199,90 \n` +
      `------------------------------------------------\n` +
      `SUBTOTAL                                 638,90 \n` +
      `DESCONTO                                  38,90 \n` +
      `TOTAL LIQUIDO                            600,00 \n` +
      `------------------------------------------------\n\n\n`,
  },
];

export function Playground() {
  const [searchParams] = useSearchParams();
  const preselectedAgentId = searchParams.get('agentId');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Form State
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [type, setType] = useState<PrintJobType>('RAW');
  const [title, setTitle] = useState<string>('Teste do Painel Admin');
  const [content, setContent] = useState<string>(TEMPLATES[0].content);
  const [copies, setCopies] = useState<number>(1);

  // Execution & Live Status State
  const [dispatching, setDispatching] = useState(false);
  const [activeJob, setActiveJob] = useState<{
    id: string;
    status: PrintJobStatus;
    printerName: string;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
  } | null>(null);

  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      setLoadingAgents(true);
      const data = await api.getAgents();
      const sorted = [...data].sort((a, b) => a.code.localeCompare(b.code));
      setAgents(sorted);

      if (preselectedAgentId) {
        setSelectedAgentId(preselectedAgentId);
      } else {
        const firstOnline = data.find((a) => a.status === 'ONLINE');
        if (firstOnline) {
          setSelectedAgentId(firstOnline.id);
        } else if (data.length > 0) {
          setSelectedAgentId(data[0].id);
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar agentes:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [preselectedAgentId]);

  // Atualiza a impressora selecionada quando o agente muda ou suas impressoras são alteradas
  useEffect(() => {
    const currentAgent = agents.find((a) => a.id === selectedAgentId);
    if (currentAgent) {
      const printersList: any[] = Array.isArray(currentAgent.printers) ? currentAgent.printers : [];
      const printerStillExists = printersList.some((p) => p.name === selectedPrinter);

      if (!printerStillExists) {
        setSelectedPrinter(currentAgent.defaultPrinter || (printersList[0]?.name ?? ''));
      }
    }
  }, [selectedAgentId, agents, selectedPrinter]);

  // Escuta WebSocket para monitorar status do job ativo e atualização de agentes/impressoras em tempo real
  useEffect(() => {
    const unsubscribe = socketManager.onDashboardUpdate((event: SocketDashboardEvent) => {
      if (event.type === 'print_job_status' && activeJob && event.job?.id === activeJob.id) {
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                status: event.job.status,
                startedAt: event.job.startedAt || prev.startedAt,
                completedAt: event.job.completedAt || prev.completedAt,
                errorMessage: event.job.errorMessage || prev.errorMessage,
              }
            : null
        );
      }

      if (event.type === 'agent_status' && event.agent) {
        setAgents((prev) =>
          prev.map((a) => (a.id === event.agent?.id ? { ...a, ...event.agent } : a))
        );
      }
    });

    return unsubscribe;
  }, [activeJob]);

  const handleApplyTemplate = (template: PrintTemplate) => {
    setType(template.type);
    setTitle(template.title);
    setContent(template.content);
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setErrorAlert('Selecione um agente de impressão.');
      return;
    }
    if (!content.trim()) {
      setErrorAlert('O conteúdo de impressão não pode ser vazio.');
      return;
    }

    setDispatching(true);
    setErrorAlert(null);

    try {
      const response = await api.dispatchPrintTest({
        agentId: selectedAgentId,
        printerName: selectedPrinter || undefined,
        type,
        title,
        content,
        options: { copies },
      });

      setActiveJob({
        id: response.jobId,
        status: response.status,
        printerName: response.printerName,
      });
    } catch (err: any) {
      setErrorAlert(err.message || 'Falha ao despachar trabalho de impressão.');
    } finally {
      setDispatching(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const printersList: any[] = Array.isArray(selectedAgent?.printers) ? selectedAgent.printers : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Playground de Impressão
          </h1>
          <p className="mt-0.5 text-xs text-surface-muted">
            Dispare impressões de teste em tempo real para qualquer agente conectado à rede.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAgents}
            isLoading={loadingAgents}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recarregar Agentes
          </Button>
          <Link to="/painel/jobs">
            <Button variant="outline" size="sm">
              Ver Histórico
            </Button>
          </Link>
        </div>
      </div>

      {errorAlert && (
        <Alert variant="destructive" title="Falha no Envio">
          {errorAlert}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Print Configuration Form (2 cols) */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="border-surface-border bg-surface-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <PlaySquare className="h-4 w-4 text-accent-500" />
                Configurar Trabalho de Teste
              </CardTitle>
              <CardDescription className="text-xs">
                Selecione o agente de destino, a impressora e o formato da carga útil.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDispatch} className="space-y-4">
                {/* Agent Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Agente de Destino *
                    </label>
                    <Select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      disabled={loadingAgents}
                    >
                      <option value="">Selecione um agente...</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.code} - {agent.name || agent.hostname || 'Sem nome'} (
                          {agent.status})
                        </option>
                      ))}
                    </Select>
                    {selectedAgent && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            selectedAgent.status === 'ONLINE' ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-surface-muted">
                          Status: <strong className="text-white">{selectedAgent.status}</strong>
                        </span>
                        {selectedAgent.company && (
                          <span className="text-surface-muted">
                            • Empresa: <strong className="text-slate-300 font-medium">{selectedAgent.company.name}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Printer Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Impressora Alvo
                    </label>
                    <Select
                      value={selectedPrinter}
                      onChange={(e) => setSelectedPrinter(e.target.value)}
                    >
                      <option value="">
                        Padrão do Agente ({selectedAgent?.defaultPrinter || 'Nenhuma configurada'})
                      </option>
                      {printersList.map((p, idx) => {
                        const pName = typeof p === 'string' ? p : p.name;
                        return (
                          <option key={idx} value={pName}>
                            {pName} {pName === selectedAgent?.defaultPrinter ? '(Padrão)' : ''}
                          </option>
                        );
                      })}
                    </Select>
                    {(() => {
                      const effectivePrinter = selectedPrinter || selectedAgent?.defaultPrinter || '';
                      const isVirtual = /pdf|xps|onenote|fax/i.test(effectivePrinter);
                      if (isVirtual) {
                        return (
                          <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-950/30 border border-amber-500/20 rounded p-1.5 leading-snug">
                            <span className="font-bold shrink-0">💡 Nota:</span>
                            <span>
                              "{effectivePrinter}" é uma impressora virtual do sistema. O SilentPrint exporta o arquivo diretamente em Downloads e o abre para conferência. Em impressoras térmicas físicas (USB/Rede), a impressão sai instantaneamente no papel.
                            </span>
                          </div>
                        );
                      }
                      return (
                        <span className="text-[11px] text-surface-muted mt-1 block">
                          Deixe em branco para utilizar a impressora padrão do agente.
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Templates Quick Bar */}
                <div className="rounded-xl border border-surface-border bg-canvas-900/90 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                    <Sparkles className="h-3 w-3 text-accent-500" />
                    Carregar Template Pré-formatado:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATES.map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className="rounded-lg border border-surface-border bg-surface-card px-2.5 py-1 text-xs text-slate-200 hover:border-accent-500/50 hover:bg-surface-cardHover transition active:scale-95"
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format and Title */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Formato de Impressão *
                    </label>
                    <Select
                      value={type}
                      onChange={(e) => setType(e.target.value as PrintJobType)}
                    >
                      <option value="RAW">RAW (Comandos ESC/POS Diretos)</option>
                      <option value="TEXT">TEXT (Texto Plano)</option>
                      <option value="PDF">PDF (Base64 / URL)</option>
                      <option value="IMAGE">IMAGE (Base64)</option>
                      <option value="HTML">HTML (Renderizado)</option>
                    </Select>
                  </div>

                  <div className="sm:col-span-2">
                    <Input
                      label="Título do Job"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Teste Caixa 01"
                    />
                  </div>
                </div>

                {/* Content Editor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Conteúdo / Carga Útil (Payload) *
                    </label>
                    <span className="text-[11px] font-mono text-surface-muted">
                      {content.length} caracteres
                    </span>
                  </div>
                  <textarea
                    rows={9}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Insira os comandos ESC/POS, texto ou HTML de impressão..."
                    className="w-full rounded-xl border border-surface-border bg-canvas-900 px-3 py-2.5 font-mono text-xs text-slate-100 placeholder:text-surface-muted/60 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    required
                  />
                </div>

                {/* Copies & Submit Button */}
                <div className="flex items-center justify-between pt-3 border-t border-surface-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-muted font-medium">Cópias:</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={copies}
                      onChange={(e) => setCopies(Number(e.target.value))}
                      className="w-16 rounded-lg border border-surface-border bg-canvas-900 px-2 py-1 text-xs text-white focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 font-mono"
                    />
                  </div>

                  <Button
                    type="submit"
                    isLoading={dispatching}
                    disabled={selectedAgent?.status !== 'ONLINE'}
                    className="gap-2"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar para Impressão
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Live Execution Monitor (1 col) */}
        <div className="space-y-5">
          <Card className="border-surface-border bg-surface-card sticky top-20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Monitor de Execução</span>
                {activeJob && (
                  <Badge
                    variant={
                      activeJob.status === 'COMPLETED'
                        ? 'success'
                        : activeJob.status === 'FAILED'
                        ? 'destructive'
                        : activeJob.status === 'PRINTING'
                        ? 'warning'
                        : 'secondary'
                    }
                  >
                    {activeJob.status}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Acompanhe a entrega e confirmação física da impressora via WebSocket.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!activeJob ? (
                <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-surface-border bg-surface-subtle/30">
                  <Printer className="h-8 w-8 text-surface-muted mb-2 opacity-50" />
                  <p className="text-xs font-semibold text-white">Nenhum teste disparado</p>
                  <p className="text-[11px] text-surface-muted mt-1 max-w-[200px]">
                    Preencha o formulário e clique em &quot;Enviar para Impressão&quot;.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* Job ID info */}
                  <div className="rounded-xl border border-surface-border bg-canvas-900/90 p-3">
                    <div className="text-[10px] text-surface-muted uppercase tracking-wider font-bold">
                      Identificador do Trabalho
                    </div>
                    <div className="font-mono text-xs text-accent-500 select-all mt-0.5 break-all font-semibold">
                      {activeJob.id}
                    </div>
                  </div>

                  {/* Execution Steps */}
                  <div className="space-y-2">
                    {/* Step 1: Queued */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-surface-border bg-canvas-900/70 p-2.5 text-xs">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-xs">Criado no Servidor</div>
                        <div className="text-[10px] text-surface-muted">Job registrado e enfileirado</div>
                      </div>
                    </div>

                    {/* Step 2: Printing */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-surface-border bg-canvas-900/70 p-2.5 text-xs">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-subtle border border-surface-border shrink-0">
                        {activeJob.status === 'PRINTING' ? (
                          <Clock className="h-3.5 w-3.5 animate-spin text-amber-400" />
                        ) : activeJob.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : activeJob.status === 'FAILED' ? (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-surface-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-xs">Despachado ao Agente</div>
                        <div className="text-[10px] text-surface-muted">
                          Impressora: <strong className="text-slate-300 font-medium">{activeJob.printerName || 'Padrão'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Finished */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-surface-border bg-canvas-900/70 p-2.5 text-xs">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-subtle border border-surface-border shrink-0">
                        {activeJob.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : activeJob.status === 'FAILED' ? (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-xs">Confirmação da Impressão</div>
                        <div className="text-[10px] text-surface-muted">
                          {activeJob.status === 'COMPLETED' && 'Impresso com sucesso pelo agente.'}
                          {activeJob.status === 'FAILED' && 'Falha reportada pelo agente.'}
                          {activeJob.status !== 'COMPLETED' &&
                            activeJob.status !== 'FAILED' &&
                            'Aguardando callback do driver...'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Error Alert if failed */}
                  {activeJob.errorMessage && (
                    <Alert variant="destructive" title="Erro no Driver">
                      {activeJob.errorMessage}
                    </Alert>
                  )}

                  {/* Success notification */}
                  {activeJob.status === 'COMPLETED' && (
                    <Alert variant="success" title="Impressão Concluída">
                      O trabalho foi finalizado com sucesso no dispositivo físico!
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
