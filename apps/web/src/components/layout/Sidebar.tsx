import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  MonitorCheck,
  PlaySquare,
  ListOrdered,
  Palette,
  X,
  Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { BrandLogo } from '../BrandLogo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  {
    path: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    path: '/companies',
    label: 'Empresas & API',
    icon: Building2,
  },
  {
    path: '/agents',
    label: 'Agentes de Impressão',
    icon: MonitorCheck,
  },
  {
    path: '/playground',
    label: 'Playground de Testes',
    icon: PlaySquare,
  },
  {
    path: '/jobs',
    label: 'Histórico de Jobs',
    icon: ListOrdered,
  },
  {
    path: '/branding',
    label: 'Personalização',
    icon: Palette,
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Backdrop mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-surface-border bg-canvas-950 transition-transform duration-200 ease-in-out md:static md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-surface-border px-4">
          <BrandLogo variant="sidebar" />
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-surface-muted hover:bg-surface-card hover:text-white md:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-surface-muted mb-2">
            Gestão & Operações
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => onClose()}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition active:scale-95 select-none',
                      isActive
                        ? 'bg-accent-600 font-semibold text-accent-foreground shadow-sm'
                        : 'text-surface-muted hover:bg-surface-card hover:text-slate-100'
                    )
                  }
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Atalho para download do agente */}
          <div className="mt-4 pt-3 border-t border-surface-border/60">
            <NavLink
              to="/download"
              target="_blank"
              onClick={() => onClose()}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-surface-muted hover:bg-surface-card hover:text-slate-100 transition"
              title="Abrir página pública de download do instalador"
            >
              <Download className="h-3.5 w-3.5 text-accent-500 flex-shrink-0" />
              <span>Baixar Instalador Desktop</span>
            </NavLink>
          </div>
        </div>

        {/* Footer info */}
        <div className="border-t border-surface-border/80 p-3">
          <div className="rounded-xl border border-surface-border bg-surface-card/60 p-2.5 text-xs">
            <div className="flex items-center justify-between text-surface-muted text-[11px]">
              <span>Versão do Hub</span>
              <span className="font-mono text-accent-400 font-bold bg-accent-500/10 px-1.5 py-0.5 rounded border border-accent-500/30">
                v{__APP_VERSION__}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-surface-muted text-[11px]">
              <span>Modo</span>
              <span className="text-slate-300 font-medium">Administrador</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
