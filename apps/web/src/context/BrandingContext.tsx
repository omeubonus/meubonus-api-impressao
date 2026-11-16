import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  BRAND_PRESETS,
  BrandColors,
  BrandConfig,
  DEFAULT_BRAND_ID,
  applyBrandToDocument,
  clearStoredBrand,
  loadStoredBrand,
  saveStoredBrand,
} from '../config/branding';
import { API_BASE_URL } from '../lib/api';

export type BrandSyncStatus = 'idle' | 'saving' | 'saved' | 'error';

interface BrandingContextValue {
  brand: BrandConfig;
  presets: BrandConfig[];
  syncStatus: BrandSyncStatus;
  selectPreset: (presetId: string) => void;
  updateBrand: (partial: Partial<BrandConfig>) => void;
  updateColors: (partial: Partial<BrandColors>) => void;
  resetBrand: () => void;
  importBrandJson: (jsonString: string) => { ok: boolean; error?: string };
  exportBrandJson: () => string;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

function normalizeBrand(raw: Partial<BrandConfig> | null | undefined): BrandConfig {
  const fallback = BRAND_PRESETS[DEFAULT_BRAND_ID] || BRAND_PRESETS.meubonus;
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    ...fallback,
    ...raw,
    colors: {
      ...fallback.colors,
      ...(raw.colors || {}),
    },
  };
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandConfig>(() => loadStoredBrand());
  const [syncStatus, setSyncStatus] = useState<BrandSyncStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applyBrandToDocument(brand);
    saveStoredBrand(brand);
  }, [brand]);

  // Busca a fonte da verdade no backend ao carregar (Login, Download, Painel)
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/branding`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.branding) return;
        setBrand(normalizeBrand(data.branding));
      })
      .catch(() => {
        // Mantém cache local se API estiver indisponível
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const pushBrandToServer = (nextBrand: BrandConfig, immediate = false) => {
    const token = localStorage.getItem('silentprint_token');
    if (!token) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    const execute = async () => {
      setSyncStatus('saving');
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/branding`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(nextBrand),
        });
        if (!res.ok) throw new Error('Falha ao salvar');
        setSyncStatus('saved');
      } catch {
        setSyncStatus('error');
      }
    };

    if (immediate) {
      void execute();
    } else {
      saveTimerRef.current = setTimeout(() => {
        void execute();
      }, 350);
    }
  };

  const selectPreset = (presetId: string) => {
    const preset = BRAND_PRESETS[presetId];
    if (preset) {
      setBrand(preset);
      pushBrandToServer(preset, true);
    }
  };

  const updateBrand = (partial: Partial<BrandConfig>) => {
    setBrand((prev) => {
      const next: BrandConfig = {
        ...prev,
        ...partial,
        id: partial.id ?? 'custom',
      };
      pushBrandToServer(next, false);
      return next;
    });
  };

  const updateColors = (partial: Partial<BrandColors>) => {
    setBrand((prev) => {
      const next: BrandConfig = {
        ...prev,
        id: 'custom',
        colors: {
          ...prev.colors,
          ...partial,
        },
      };
      pushBrandToServer(next, false);
      return next;
    });
  };

  const resetBrand = () => {
    clearStoredBrand();
    const fallback = BRAND_PRESETS[DEFAULT_BRAND_ID] || BRAND_PRESETS.meubonus;
    setBrand(fallback);

    const token = localStorage.getItem('silentprint_token');
    if (token) {
      setSyncStatus('saving');
      fetch(`${API_BASE_URL}/api/admin/branding`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => setSyncStatus(res.ok ? 'saved' : 'error'))
        .catch(() => setSyncStatus('error'));
    }
  };

  const exportBrandJson = () => JSON.stringify(brand, null, 2);

  const importBrandJson = (jsonString: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(jsonString) as Partial<BrandConfig>;
      if (!parsed || typeof parsed !== 'object' || !parsed.name || !parsed.colors) {
        return { ok: false, error: 'JSON inválido: campos "name" e "colors" são obrigatórios.' };
      }
      const next = normalizeBrand(parsed);
      setBrand(next);
      pushBrandToServer(next, true);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível interpretar o JSON informado.' };
    }
  };

  return (
    <BrandingContext.Provider
      value={{
        brand,
        presets: Object.values(BRAND_PRESETS),
        syncStatus,
        selectPreset,
        updateBrand,
        updateColors,
        resetBrand,
        importBrandJson,
        exportBrandJson,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error('useBranding deve ser usado dentro de BrandingProvider');
  }
  return ctx;
}
