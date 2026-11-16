import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { socketManager, SocketStatus } from '../../lib/socket';
import { Button } from '../ui/Button';
import { LogOut, Menu, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const { brand } = useBranding();
  const [socketStatus, setSocketStatus] = useState<SocketStatus>(socketManager.getStatus());

  useEffect(() => {
    const unsubscribe = socketManager.onStatusChange((status) => {
      setSocketStatus(status);
    });
    return unsubscribe;
  }, []);

  const getStatusBadge = () => {
    const isConnected = socketStatus === 'connected';
    const isConnecting = socketStatus === 'connecting';

    return (
      <div className="relative flex items-center justify-center group">
        <div
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-card transition-colors cursor-pointer"
          title={
            isConnected
              ? 'WebSocket Ativo'
              : isConnecting
              ? 'Conectando ao Hub...'
              : 'WebSocket Desconectado'
          }
        >
          {isConnected ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            </span>
          ) : isConnecting ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-sm shadow-amber-500/50"></span>
            </span>
          ) : (
            <span className="relative flex h-2.5 w-2.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-sm shadow-rose-500/50"></span>
            </span>
          )}
        </div>

        {/* Hover Tooltip idêntico ao Desktop */}
        <div className="pointer-events-none absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-surface-card border border-surface-border px-2.5 py-1 text-[10px] font-medium text-slate-200 shadow-xl z-50 backdrop-blur-sm">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : 'bg-rose-400'
            }`}
          />
          {isConnected
            ? 'WebSocket Ativo'
            : isConnecting
            ? 'Conectando ao Hub...'
            : 'WebSocket Desconectado'}
        </div>
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-surface-border bg-canvas-900/95 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-1.5 text-surface-muted hover:bg-surface-card hover:text-white md:hidden transition-colors"
          aria-label="Alternar menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="hidden sm:block text-xs font-semibold text-surface-muted">
          {brand.subtitle}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {getStatusBadge()}

        {user && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-surface-border">
            <div className="hidden text-right md:block">
              <p className="text-xs font-bold text-white leading-tight">{user.name}</p>
              <p className="text-[10px] text-surface-muted leading-tight font-mono">{user.email}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-card text-slate-300 border border-surface-border">
              <UserIcon className="h-4 w-4" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              title="Encerrar sessão"
              className="text-slate-300 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-950/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
