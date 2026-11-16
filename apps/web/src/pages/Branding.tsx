import React, { useRef, useState } from 'react';
import {
  Palette,
  Upload,
  RotateCcw,
  Check,
  Download as DownloadIcon,
  Copy,
  FileJson,
  Sparkles,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { useBranding } from '../context/BrandingContext';
import { deriveAccentColors } from '../config/branding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { BrandLogo } from '../components/BrandLogo';

export function Branding() {
  const {
    brand,
    presets,
    syncStatus,
    selectPreset,
    updateBrand,
    updateColors,
    resetBrand,
    exportBrandJson,
    importBrandJson,
  } = useBranding();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [copiedJson, setCopiedJson] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'faviconUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      notify('error', 'Arquivo muito grande. Utilize uma imagem de até 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateBrand({ [field]: reader.result });
        notify('success', field === 'logoUrl' ? 'Logotipo atualizado!' : 'Favicon atualizado!');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePrimaryColorChange = (hex: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      updateColors(deriveAccentColors(hex));
    } else {
      updateColors({ accent500: hex, accent600: hex });
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(exportBrandJson());
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
      notify('success', 'Configuração JSON copiada! Você pode colar no Agente Desktop.');
    } catch {
      notify('error', 'Não foi possível copiar para a área de transferência.');
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([exportBrandJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `branding-${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    const res = importBrandJson(importText);
    if (res.ok) {
      setImportText('');
      setShowImportBox(false);
      notify('success', 'Tema importado e aplicado com sucesso!');
    } else {
      notify('error', res.error || 'Erro ao importar JSON.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Palette className="h-5 w-5 text-accent-500" />
            Personalização & White-Label
          </h1>
          <p className="text-xs text-surface-muted mt-0.5">
            Adapte cores, logotipo e textos do painel. As alterações são sincronizadas automaticamente com todos os Agentes Desktop conectados.
          </p>
          {syncStatus !== 'idle' && (
            <p className="text-[11px] mt-1 font-medium">
              {syncStatus === 'saving' && <span className="text-amber-400">Sincronizando com o servidor e agentes...</span>}
              {syncStatus === 'saved' && <span className="text-emerald-400">✓ Sincronizado com o servidor e agentes conectados</span>}
              {syncStatus === 'error' && <span className="text-rose-400">Falha ao sincronizar com o servidor</span>}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            {copiedJson ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedJson ? 'Copiado!' : 'Copiar JSON'}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadJson}>
            <DownloadIcon className="h-3.5 w-3.5" />
            <span>Exportar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImportBox((v) => !v)}>
            <FileJson className="h-3.5 w-3.5" />
            <span>Importar</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetBrand();
              notify('success', 'Identidade visual restaurada para o padrão.');
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restaurar</span>
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          {feedback.text}
        </Alert>
      )}

      {showImportBox && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Importar Configuração JSON</CardTitle>
            <CardDescription className="text-xs">
              Cole abaixo o JSON exportado de outro painel ou cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={5}
              placeholder='{"name": "Minha Empresa", "colors": { ... }}'
              className="w-full rounded-lg border border-surface-border bg-canvas-900 p-3 font-mono text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowImportBox(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleImportJson} disabled={!importText.trim()}>
                Aplicar JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Presets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-500" />
            Temas Prontos (Presets)
          </CardTitle>
          <CardDescription className="text-xs">
            Selecione um tema pré-configurado para alternar a identidade visual instantaneamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {presets.map((preset) => {
              const isActive = brand.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    selectPreset(preset.id);
                    notify('success', `Tema "${preset.name}" aplicado!`);
                  }}
                  className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition ${
                    isActive
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-surface-border bg-canvas-900/60 hover:border-surface-muted/50 hover:bg-surface-cardHover'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: preset.colors.accent500 }}
                      />
                      <span className="text-xs font-bold text-white">{preset.name}</span>
                    </div>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                        <Check className="h-2.5 w-2.5" /> Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-surface-muted line-clamp-1">{preset.subtitle}</p>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span
                      className="h-3 w-6 rounded border border-white/10"
                      style={{ backgroundColor: preset.colors.canvas950 }}
                      title="Fundo"
                    />
                    <span
                      className="h-3 w-6 rounded border border-white/10"
                      style={{ backgroundColor: preset.colors.surfaceCard }}
                      title="Card"
                    />
                    <span
                      className="h-3 w-6 rounded border border-white/10"
                      style={{ backgroundColor: preset.colors.accent500 }}
                      title="Destaque"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identity & Texts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Identidade & Textos</CardTitle>
            <CardDescription className="text-xs">
              Personalize o nome, logotipo e mensagens exibidas no painel e na tela de login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="Nome da Marca / Plataforma"
                  value={brand.name}
                  onChange={(e) => updateBrand({ name: e.target.value })}
                  placeholder="Ex: Meu Bônus"
                />
              </div>
              <Input
                label="Tag / Badge"
                value={brand.badge}
                onChange={(e) => updateBrand({ badge: e.target.value })}
                placeholder="Ex: PRINT"
              />
            </div>

            <Input
              label="Subtítulo do Painel"
              value={brand.subtitle}
              onChange={(e) => updateBrand({ subtitle: e.target.value })}
              placeholder="Central de Impressão Inteligente"
            />

            <Input
              label="Descrição na Tela de Login"
              value={brand.loginSubtitle}
              onChange={(e) => updateBrand({ loginSubtitle: e.target.value })}
            />

            <Input
              label="Destaque na Página de Download"
              value={brand.downloadHeadline}
              onChange={(e) => updateBrand({ downloadHeadline: e.target.value })}
            />

            {/* Logo Upload & URL */}
            <div className="space-y-2 pt-1 border-t border-surface-border">
              <label className="block text-xs font-semibold text-slate-300">
                Logotipo (PNG, SVG ou URL)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={(e) => handleImageUpload(e, 'logoUrl')}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Enviar Logo</span>
                </Button>
                {brand.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateBrand({ logoUrl: null })}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remover Logo</span>
                  </Button>
                )}
              </div>
              <Input
                placeholder="Ou cole a URL da imagem (ex: /brands/meubonus-logo.png)"
                value={brand.logoUrl || ''}
                onChange={(e) => updateBrand({ logoUrl: e.target.value || null })}
              />
              <label className="flex items-center gap-2 text-xs text-surface-muted cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={brand.showLogoText}
                  onChange={(e) => updateBrand({ showLogoText: e.target.checked })}
                  className="rounded border-surface-border bg-canvas-900 text-accent-500 focus:ring-accent-500"
                />
                <span>Exibir nome da marca ao lado do logotipo</span>
              </label>
            </div>

            {/* Favicon Upload */}
            <div className="space-y-2 pt-1 border-t border-surface-border">
              <label className="block text-xs font-semibold text-slate-300">Favicon da Aba</label>
              <div className="flex items-center gap-2">
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/x-icon"
                  onChange={(e) => handleImageUpload(e, 'faviconUrl')}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => faviconInputRef.current?.click()}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Enviar Favicon</span>
                </Button>
                {brand.faviconUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateBrand({ faviconUrl: null })}
                  >
                    Usar ícone padrão
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Colors & Live Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Paleta de Cores</CardTitle>
              <CardDescription className="text-xs">
                As alterações são aplicadas em tempo real em todo o painel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ColorField
                label="Cor Principal (Destaque / Botões)"
                value={brand.colors.accent500}
                onChange={handlePrimaryColorChange}
              />
              <ColorField
                label="Texto sobre a Cor Principal"
                value={brand.colors.onAccent}
                onChange={(val) => updateColors({ onAccent: val })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surface-border">
                <ColorField
                  label="Fundo Principal"
                  value={brand.colors.canvas950}
                  onChange={(val) => updateColors({ canvas950: val })}
                />
                <ColorField
                  label="Fundo Header / Secundário"
                  value={brand.colors.canvas900}
                  onChange={(val) => updateColors({ canvas900: val })}
                />
                <ColorField
                  label="Fundo de Cards"
                  value={brand.colors.surfaceCard}
                  onChange={(val) =>
                    updateColors({
                      surfaceCard: val,
                      surfaceCardHover: val,
                      surfaceSubtle: val,
                    })
                  }
                />
                <ColorField
                  label="Bordas"
                  value={brand.colors.surfaceBorder}
                  onChange={(val) =>
                    updateColors({ surfaceBorder: val, surfaceBorderSubtle: val })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Mini Preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pré-visualização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-surface-border bg-canvas-950 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-surface-border pb-3">
                  <BrandLogo variant="header" />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Online
                  </span>
                </div>
                <div className="rounded-lg border border-surface-border bg-surface-card p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-white">Impressora Caixa 01</p>
                    <p className="text-[11px] text-surface-muted">
                      Pronta para receber pedidos e cupons
                    </p>
                  </div>
                  <Button size="sm" type="button">
                    Imprimir Teste
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold text-slate-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#FFB800'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border border-surface-border bg-canvas-900 p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 rounded-lg border border-surface-border bg-canvas-900 px-2.5 font-mono text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
