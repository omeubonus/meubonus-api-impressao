export interface BrandColors {
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

export interface BrandConfig {
  id: string;
  name: string;
  badge: string;
  subtitle: string;
  loginTitle: string;
  loginSubtitle: string;
  downloadHeadline: string;
  downloadDescription: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  showLogoText: boolean;
  colors: BrandColors;
}

export const BRAND_STORAGE_KEY = 'sp_brand_config_v1';

export const BRAND_PRESETS: Record<string, BrandConfig> = {
  meubonus: {
    id: 'meubonus',
    name: 'Meu Bônus',
    badge: 'PRINT',
    subtitle: 'Central de Impressão • Gestão e Cashback',
    loginTitle: 'Acesso Administrativo',
    loginSubtitle: 'Central de Impressão Inteligente para Restaurantes, Lojas e Varejo.',
    downloadHeadline: 'Para o seu Caixa, Cozinha & PDV',
    downloadDescription:
      'Instale o agente local no computador conectado à sua impressora de cupom ou térmica de rede. Ele conecta com a plataforma e imprime pedidos e comprovantes instantaneamente.',
    logoUrl: '/brands/meubonus-logo.png',
    faviconUrl: '/brands/meubonus-favicon.png',
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
    badge: 'HUB',
    subtitle: 'Painel de Controle Central de Impressão',
    loginTitle: 'Acesso Administrativo',
    loginSubtitle: 'Informe seu e-mail e senha de administrador para continuar.',
    downloadHeadline: 'Para o seu Caixa & PDV',
    downloadDescription:
      'Instale o agente local no computador conectado à sua impressora de cupom ou térmica de rede. Ele conecta com o HUB na nuvem e imprime instantaneamente sem caixas de diálogo.',
    logoUrl: null,
    faviconUrl: null,
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
  foodgreen: {
    id: 'foodgreen',
    name: 'PDV Express',
    badge: 'PRINT',
    subtitle: 'Impressão Silenciosa para Delivery & Balcão',
    loginTitle: 'Acesso Administrativo',
    loginSubtitle: 'Gerencie impressoras térmicas e filas de pedidos em tempo real.',
    downloadHeadline: 'Para o seu Caixa & Cozinha',
    downloadDescription:
      'Conecte suas impressoras térmicas USB ou de rede ao painel na nuvem e imprima comandas e recibos automaticamente.',
    logoUrl: null,
    faviconUrl: null,
    showLogoText: true,
    colors: {
      canvas950: '#070d0b',
      canvas900: '#050a08',
      canvas850: '#0b1411',
      surfaceCard: '#101c17',
      surfaceCardHover: '#15251f',
      surfaceSubtle: '#162720',
      surfaceBorder: '#1f362d',
      surfaceBorderSubtle: '#182b23',
      surfaceMuted: '#8fa89d',
      accent400: '#34d399',
      accent500: '#10b981',
      accent600: '#059669',
      accent700: '#047857',
      onAccent: '#ffffff',
    },
  },
};

export const DEFAULT_BRAND_ID =
  (import.meta.env.VITE_DEFAULT_BRAND as string) && BRAND_PRESETS[import.meta.env.VITE_DEFAULT_BRAND as string]
    ? (import.meta.env.VITE_DEFAULT_BRAND as string)
    : 'meubonus';

export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return '255 184 0';
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function adjustHexBrightness(hex: string, factor: number): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const mix = (channel: number) =>
    factor >= 0 ? clamp(channel + (255 - channel) * factor) : clamp(channel * (1 + factor));

  return (
    '#' +
    [mix(r), mix(g), mix(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function getContrastingTextHex(bgHex: string): string {
  const clean = bgHex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#ffffff';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#1A1200' : '#ffffff';
}

export function deriveAccentColors(primaryHex: string): Pick<
  BrandColors,
  'accent400' | 'accent500' | 'accent600' | 'accent700' | 'onAccent'
> {
  return {
    accent400: adjustHexBrightness(primaryHex, 0.28),
    accent500: primaryHex,
    accent600: primaryHex,
    accent700: adjustHexBrightness(primaryHex, -0.22),
    onAccent: getContrastingTextHex(primaryHex),
  };
}

export function applyBrandToDocument(brand: BrandConfig): void {
  if (typeof document === 'undefined') return;
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

  document.title = `${brand.name}${brand.badge ? ` ${brand.badge}` : ''} - Painel Administrativo`;

  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (link) {
    if (brand.faviconUrl) {
      link.href = brand.faviconUrl;
    } else {
      const encodedAccent = encodeURIComponent(c.accent500);
      link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${encodedAccent}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'/><path d='M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6'/><rect x='6' y='14' width='12' height='8' rx='1'/></svg>`;
    }
  }
}

export function loadStoredBrand(): BrandConfig {
  const fallback = BRAND_PRESETS[DEFAULT_BRAND_ID] || BRAND_PRESETS.meubonus;
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BrandConfig>;
    return {
      ...fallback,
      ...parsed,
      colors: {
        ...fallback.colors,
        ...(parsed.colors || {}),
      },
    };
  } catch {
    return fallback;
  }
}

export function saveStoredBrand(brand: BrandConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(brand));
  } catch {
    // ignore storage quota errors
  }
}

export function clearStoredBrand(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BRAND_STORAGE_KEY);
  } catch {
    // ignore
  }
}
