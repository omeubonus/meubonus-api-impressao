import React, { useState, useEffect, useCallback } from 'react';
import { api, API_BASE_URL } from '../lib/api';
import { Company } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/Table';
import { Alert } from '../components/ui/Alert';
import { formatDate } from '../lib/utils';
import {
  Building2,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  RotateCw,
  Code2,
  Edit2,
  Power,
  RefreshCw,
  Search,
} from 'lucide-react';

export function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '' });
  const [saving, setSaving] = useState(false);

  // Visibilidade de API Keys
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal de Regeneração de Chave
  const [regeneratingCompany, setRegeneratingCompany] = useState<Company | null>(null);
  const [isRegenModalOpen, setIsRegenModalOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Modal de Guia de Integração
  const [integrationCompany, setIntegrationCompany] = useState<Company | null>(null);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCompanies();
      setCompanies(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar lista de empresas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleOpenCreateModal = () => {
    setEditingCompany(null);
    setFormData({ name: '', slug: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormData({ name: company.name, slug: company.slug });
    setIsModalOpen(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingCompany) {
        await api.updateCompany(editingCompany.id, formData);
      } else {
        await api.createCompany(formData);
      }
      setIsModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (company: Company) => {
    try {
      await api.updateCompany(company.id, { active: !company.active });
      fetchCompanies();
    } catch (err: any) {
      alert(err.message || 'Erro ao alternar status da empresa');
    }
  };

  const handleCopyApiKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleKeyVisibility = (companyId: string) => {
    setVisibleKeys((prev) => ({
      ...prev,
      [companyId]: !prev[companyId],
    }));
  };

  const handleConfirmRegenerateKey = async () => {
    if (!regeneratingCompany) return;
    setRegenerating(true);
    try {
      await api.regenerateCompanyKey(regeneratingCompany.id);
      setIsRegenModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      alert(err.message || 'Erro ao regenerar API Key');
    } finally {
      setRegenerating(false);
    }
  };

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Empresas & Clientes (Tenants)
          </h1>
          <p className="mt-0.5 text-xs text-surface-muted">
            Gerencie os clientes da plataforma, credenciais de API e acessos de integração.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCompanies}
            isLoading={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
          <Button size="sm" onClick={handleOpenCreateModal} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nova Empresa
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" title="Atenção">
          {error}
        </Alert>
      )}

      {/* Filter and Search */}
      <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-surface-muted" />
          <Input
            placeholder="Buscar por nome da empresa ou slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-xs text-surface-muted font-mono">
          {filteredCompanies.length} empresa{filteredCompanies.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Companies Table */}
      <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>Agentes</TableHead>
              <TableHead>Impressões</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-surface-muted">
                  Carregando empresas...
                </TableCell>
              </TableRow>
            ) : filteredCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-surface-muted">
                  Nenhuma empresa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredCompanies.map((company) => {
                const isKeyVisible = !!visibleKeys[company.id];
                const isCopied = copiedKey === company.apiKey;

                return (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                          <Building2 className="h-3.5 w-3.5 text-accent-500" />
                          {company.name}
                        </div>
                        <div className="text-[11px] font-mono text-surface-muted mt-0.5">slug: {company.slug}</div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <button
                        onClick={() => handleToggleStatus(company)}
                        className="group flex items-center gap-1.5"
                        title="Clique para alternar o status"
                      >
                        <Badge variant={company.active ? 'success' : 'secondary'}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full mr-1 ${
                              company.active ? 'bg-emerald-400' : 'bg-slate-500'
                            }`}
                          />
                          {company.active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </button>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-200 bg-canvas-900 px-2 py-0.5 rounded border border-surface-border max-w-[190px] truncate select-all">
                          {isKeyVisible
                            ? company.apiKey
                            : `${company.apiKey.slice(0, 10)}••••••••••••••••`}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility(company.id)}
                          className="text-surface-muted hover:text-slate-200 transition-colors p-1"
                          title={isKeyVisible ? 'Ocultar chave' : 'Mostrar chave'}
                        >
                          {isKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyApiKey(company.apiKey)}
                          className="text-surface-muted hover:text-accent-500 transition-colors p-1"
                          title="Copiar API Key"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRegeneratingCompany(company);
                            setIsRegenModalOpen(true);
                          }}
                          className="text-surface-muted hover:text-amber-400 transition-colors p-1"
                          title="Regenerar API Key"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs text-slate-200">
                        {company._count?.agents || 0}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs text-slate-200">
                        {company._count?.jobs || 0}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs text-surface-muted">
                      {formatDate(company.createdAt)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIntegrationCompany(company);
                            setIsDocsModalOpen(true);
                          }}
                          title="Guia de Integração"
                          className="text-accent-500 hover:text-accent-400 hover:bg-accent-950/30"
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline ml-1 text-xs">API Docs</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditModal(company)}
                          title="Editar dados"
                          className="text-surface-muted hover:text-white"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(company)}
                          title={company.active ? 'Desativar empresa' : 'Ativar empresa'}
                          className={company.active ? 'text-rose-400 hover:bg-rose-950/30' : 'text-emerald-400 hover:bg-emerald-950/30'}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Criar / Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCompany ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
        description="Configure as informações do cliente para gerar credenciais de acesso."
      >
        <form onSubmit={handleSaveCompany} className="space-y-4">
          <Input
            label="Nome da Empresa *"
            placeholder="Ex: Restaurante Bom Sabor Ltda"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />

          <Input
            label="Slug (Identificador na URL / opcional)"
            placeholder="Ex: restaurante-bom-sabor"
            value={formData.slug}
            onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={saving}>
              {editingCompany ? 'Salvar Alterações' : 'Criar Empresa'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Regeneração de API Key */}
      <Modal
        isOpen={isRegenModalOpen}
        onClose={() => setIsRegenModalOpen(false)}
        title="Regenerar API Key?"
        description="Esta ação invalidará imediatamente a chave atual."
      >
        <div className="space-y-4">
          <Alert variant="warning">
            Ao gerar uma nova chave para <strong>{regeneratingCompany?.name}</strong>, quaisquer
            sistemas externos ou integrações que usem a chave antiga pararão de funcionar até que
            sejam atualizados com a nova chave.
          </Alert>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRegenModalOpen(false)}
              disabled={regenerating}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRegenerateKey}
              isLoading={regenerating}
            >
              Regenerar Chave Agora
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Guia de Integração da API */}
      <Modal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        title={`Guia de Integração - ${integrationCompany?.name}`}
        description="Exemplos prontos de cURL para reivindicar agentes e enviar trabalhos de impressão."
        maxWidth="2xl"
      >
        {integrationCompany && (
          <div className="space-y-5 text-xs">
            {/* API Key Box */}
            <div className="rounded-xl border border-accent-500/30 bg-accent-950/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-400">
                  Header de Autenticação da Empresa
                </span>
                <button
                  onClick={() => handleCopyApiKey(integrationCompany.apiKey)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-accent-300 hover:text-white"
                >
                  <Copy className="h-3 w-3" />
                  Copiar Chave
                </button>
              </div>
              <div className="mt-2 font-mono text-xs text-white bg-canvas-900 p-2.5 rounded-lg border border-surface-border break-all select-all font-semibold">
                X-API-Key: {integrationCompany.apiKey}
              </div>
            </div>

            {/* Passo 1: Claim Agent */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-bold text-white text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-600 text-[10px] text-white font-bold">
                  1
                </span>
                <span>Vincular Agente à Empresa (Claim)</span>
              </div>
              <p className="text-xs text-surface-muted leading-relaxed">
                Chame este endpoint a partir do seu sistema web/ERP informando o código exibido na
                tela do aplicativo Desktop instalado no cliente:
              </p>
              <pre className="rounded-xl border border-surface-border bg-canvas-900 p-3.5 font-mono text-xs text-slate-200 overflow-x-auto select-all">
{`curl -X POST ${API_BASE_URL}/api/v1/agents/claim \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${integrationCompany.apiKey}" \\
  -d '{
    "code": "IMP-123456",
    "name": "Impressora Balcão Cozinha"
  }'`}
              </pre>
            </div>

            {/* Passo 2: Print Job */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-bold text-white text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-600 text-[10px] text-white font-bold">
                  2
                </span>
                <span>Enviar Trabalho de Impressão Silenciosa</span>
              </div>
              <p className="text-xs text-surface-muted leading-relaxed">
                Dispare ordens de impressão em formatos TEXT, RAW (ESC/POS), PDF, IMAGE ou HTML:
              </p>
              <pre className="rounded-xl border border-surface-border bg-canvas-900 p-3.5 font-mono text-xs text-slate-200 overflow-x-auto select-all">
{`curl -X POST ${API_BASE_URL}/api/v1/print \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${integrationCompany.apiKey}" \\
  -d '{
    "agentCode": "IMP-123456",
    "type": "RAW",
    "title": "Pedido #4920",
    "content": "\\x1b\\x40\\x1b\\x61\\x01PEDIDO #4920\\n\\x1b\\x61\\x001x Pizza Calabresa\\nTotal: R$ 54,00\\n\\n\\x1d\\x56\\x01",
    "options": {
      "copies": 1
    }
  }'`}
              </pre>
            </div>

            <div className="flex justify-end pt-3 border-t border-surface-border">
              <Button onClick={() => setIsDocsModalOpen(false)}>
                Fechar Guia
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
