import meuBonusLogo from '../assets/meubonus-logo.png';

export interface DesktopBrandColors {
  canvas950: string;
  canvas900: string;
  canvas850: string;
  surfaceCard: string;
  surfaceCardHover: string;
  surfaceSubtle: string;
  surfaceBorder: string;
  surfaceBorderSubtle: string;
  surfaceMuted: string;
  accent400: string;
  accent500: string;
  accent600: string;
  accent700: string;
  onAccent: string;
}

export interface DesktopBrandConfig {
  id: string;
  name: string;
  logoUrl: string | null;
  showLogoText: boolean;
  colors: DesktopBrandColors;
}

const STORAGE_KEY = 'sp_desktop_brand_config_v1';

export const DESKTOP_BRAND_PRESETS: Record<string, DesktopBrandConfig> = {
  meubonus: {
    id: 'meubonus',
    name: 'Meu Bônus',
    logoUrl: meuBonusLogo,
    showLogoText: false,
    colors: {
      canvas950: '#0E0E10',
      canvas900: '#08080A',
      canvas850: '#121215',
      surfaceCard: '#17171A',
      surfaceCardHover: '#1F1F24',
      surfaceSubtle: '#1F1F24',
      surfaceBorder: '#2A2A30',
      surfaceBorderSubtle: '#222228',
      surfaceMuted: '#9C9A95',
      accent400: '#FFD166',
      accent500: '#FFB800',
      accent600: '#FFB800',
      accent700: '#C98A00',
      onAccent: '#1A1200',
    },
  },
  silentprint: {
    id: 'silentprint',
    name: 'SilentPrint',
    logoUrl: null,
    showLogoText: true,
    colors: {
      canvas950: '#080b11',
      canvas900: '#0c1017',
      canvas850: '#0f141d',
      surfaceCard: '#131924',
      surfaceCardHover: '#17202f',
      surfaceSubtle: '#192233',
      surfaceBorder: '#1f2a3d',
      surfaceBorderSubtle: '#182130',
      surfaceMuted: '#8b9bb4',
      accent400: '#38bdf8',
      accent500: '#0ea5e9',
      accent600: '#0284c7',
      accent700: '#0369a1',
      onAccent: '#ffffff',
    },
  },
};

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '255 184 0';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function applyDesktopBrand(brand: DesktopBrandConfig): void {
  const root = document.documentElement;
  const c = brand.colors;
  root.style.setProperty('--color-canvas-950', hexToRgbTriplet(c.canvas950));
  root.style.setProperty('--color-canvas-900', hexToRgbTriplet(c.canvas900));
  root.style.setProperty('--color-canvas-850', hexToRgbTriplet(c.canvas850));
  root.style.setProperty('--color-surface-card', hexToRgbTriplet(c.surfaceCard));
  root.style.setProperty('--color-surface-card-hover', hexToRgbTriplet(c.surfaceCardHover));
  root.style.setProperty('--color-surface-subtle', hexToRgbTriplet(c.surfaceSubtle));
  root.style.setProperty('--color-surface-border', hexToRgbTriplet(c.surfaceBorder));
  root.style.setProperty('--color-surface-border-subtle', hexToRgbTriplet(c.surfaceBorderSubtle));
  root.style.setProperty('--color-surface-muted', hexToRgbTriplet(c.surfaceMuted));
  root.style.setProperty('--color-accent-400', hexToRgbTriplet(c.accent400));
  root.style.setProperty('--color-accent-500', hexToRgbTriplet(c.accent500));
  root.style.setProperty('--color-accent-600', hexToRgbTriplet(c.accent600));
  root.style.setProperty('--color-accent-700', hexToRgbTriplet(c.accent700));
  root.style.setProperty('--color-on-accent', hexToRgbTriplet(c.onAccent));
  document.title = `${brand.name} - Agente Desktop`;
}

export function resolveDesktopBrand(
  remote?: {
    id?: string;
    name?: string;
    logoUrl?: string | null;
    showLogoText?: boolean;
    colors?: Partial<DesktopBrandColors>;
  } | null
): DesktopBrandConfig {
  const fallback = DESKTOP_BRAND_PRESETS.meubonus;
  if (!remote) return fallback;

  let logoUrl = remote.logoUrl ?? null;
  if (logoUrl === '/brands/meubonus-logo.png') {
    logoUrl = meuBonusLogo;
  }

  return {
    id: remote.id || 'custom',
    name: remote.name || fallback.name,
    logoUrl,
    showLogoText: remote.showLogoText ?? true,
    colors: {
      ...fallback.colors,
      ...(remote.colors || {}),
    },
  };
}
