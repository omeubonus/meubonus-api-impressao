import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { ShieldCheck, Sparkles, Download } from 'lucide-react';

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const { brand } = useBranding();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/painel" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      navigate('/painel');
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar. Verifique suas credenciais.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('admin@silentprint.local');
    setPassword('Admin@123456');
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-950 px-4 py-12 relative overflow-hidden font-sans">
      {/* Background glowing decorations */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <BrandLogo variant="hero" />
          <p className="mt-2 text-xs text-surface-muted">
            {brand.loginSubtitle}
          </p>
        </div>

        <Card className="border-surface-border bg-surface-card/95 shadow-2xl backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">{brand.loginTitle}</CardTitle>
            <CardDescription className="text-xs">
              Informe seu e-mail e senha de administrador para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Input
                label="E-mail"
                type="email"
                placeholder="admin@silentprint.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <Input
                label="Senha"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              <Button
                type="submit"
                className="w-full mt-2"
                isLoading={submitting || isLoading}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Entrar no Painel
              </Button>
            </form>

            {/* Demo credentials helper */}
            <div className="mt-5 rounded-xl border border-surface-border bg-canvas-900/90 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-[11px]">
                  <Sparkles className="h-3 w-3 text-accent-500" />
                  Credenciais Padrão:
                </span>
                <button
                  type="button"
                  onClick={handleFillDemo}
                  className="text-[11px] font-semibold text-accent-500 hover:text-accent-400 underline underline-offset-2"
                >
                  Preencher
                </button>
              </div>
              <div className="mt-2 space-y-0.5 font-mono text-surface-muted text-[11px]">
                <p>Usuário: <span className="text-slate-200">admin@silentprint.local</span></p>
                <p>Senha: <span className="text-slate-200">Admin@123456</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Link para download do agente */}
        <div className="mt-5 text-center">
          <Link
            to="/download"
            className="text-xs text-surface-muted hover:text-accent-400 transition-colors inline-flex items-center gap-1.5 font-medium py-1 px-2 rounded-lg hover:bg-surface-card/60"
          >
            <Download className="h-3.5 w-3.5 text-accent-500" />
            Precisa instalar o Agente no Caixa? Baixar aqui
          </Link>
        </div>
      </div>
    </div>
  );
}
