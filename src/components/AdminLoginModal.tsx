import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { VictoriaLogo } from './VictoriaLogo';
import { executeFirstSuperAdminBootstrap, seedInitialContentIfEmpty } from '../services/bootstrapService';
import {
  X,
  Shield,
  KeyRound,
  AlertCircle,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const {
    user,
    isAdmin,
    isSuperAdmin,
    adminProfile,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    logout,
    refreshAdminProfile,
    loading,
    error,
  } = useAuth();

  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('google');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('victorialarresidencial@gmail.com');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    try {
      setLocalFeedback(null);
      await signInWithGoogle();
      // If already admin or owner, proceed
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err: any) {
      console.warn('Google sign in flow notice:', err);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalFeedback(null);
    if (!emailInput || !passwordInput) {
      setLocalFeedback({ type: 'error', message: 'Por favor, informe seu e-mail e senha.' });
      return;
    }

    try {
      if (emailMode === 'login') {
        await signInWithEmail(emailInput.trim(), passwordInput);
        setLocalFeedback({ type: 'success', message: 'Autenticado com sucesso!' });
      } else {
        await registerWithEmail(emailInput.trim(), passwordInput);
        setLocalFeedback({ type: 'success', message: 'Conta criada com sucesso!' });
      }
      await refreshAdminProfile();
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setLocalFeedback({ type: 'error', message: err.message || 'Erro na autenticação' });
    }
  };

  const handleActivateSuperAdmin = async () => {
    if (!user) return;
    try {
      setIsBootstrapping(true);
      setLocalFeedback(null);
      const res = await executeFirstSuperAdminBootstrap(user.uid, user.email || 'victorialarresidencial@gmail.com');
      if (!res.alreadyInitialized) {
        await seedInitialContentIfEmpty();
      }
      await refreshAdminProfile();
      setLocalFeedback({ type: 'success', message: res.message });
      if (onLoginSuccess) {
        setTimeout(() => onLoginSuccess(), 600);
      }
    } catch (err: any) {
      setLocalFeedback({ type: 'error', message: err.message || 'Erro ao provisionar superadministrador' });
    } finally {
      setIsBootstrapping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FAF9F5] border border-[#173D2B]/15 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-[#173D2B] p-6 text-[#FAF9F5] relative flex flex-col items-center text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-full transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <VictoriaLogo variant="light" size="md" className="justify-center mb-3" />
          <h2 className="text-lg font-serif tracking-wide text-white font-semibold">
            Portal Administrativo Seguro
          </h2>
          <p className="text-xs text-[#FAF9F5]/75 mt-1 max-w-xs">
            Acesso exclusivo para gestão assistencial e diretoria da Victoria Lar Residencial.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {(error || localFeedback) && (
            <div
              className={`border text-xs p-3 rounded-lg flex items-start gap-2 ${
                localFeedback?.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {localFeedback?.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <span>{localFeedback?.message || error}</span>
            </div>
          )}

          {user ? (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-neutral-200 text-sm">
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">
                  Sessão Autenticada
                </div>
                <div className="font-semibold text-neutral-900 mt-1">{user.email}</div>
                <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Status do E-mail:</span>
                  {user.emailVerified ? (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Verificado
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                      Não Verificado
                    </span>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Nível de Acesso:</span>
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <Shield className="w-3 h-3 text-emerald-600" />
                      {isSuperAdmin ? 'Superadministrador Ativo' : 'Administrador Ativo'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      {!user.emailVerified ? 'E-mail Pendente de Verificação' : 'Não Provisionado'}
                    </span>
                  )}
                </div>
              </div>

              {!isAdmin && (
                <div className="bg-amber-50/90 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 leading-relaxed space-y-2">
                  <p>
                    <strong>Provisionamento Inicial:</strong> Você está conectado como <strong>{user.email}</strong>.
                    {!user.emailVerified
                      ? ' É necessário que seu e-mail esteja verificado junto ao Google antes de solicitar o provisionamento.'
                      : ' Para selar este usuário como Superadministrador e liberar o Painel ADM, clique no botão abaixo.'}
                  </p>
                  <button
                    onClick={handleActivateSuperAdmin}
                    disabled={isBootstrapping || !user.emailVerified}
                    className="w-full py-2 px-3 bg-[#B8954A] hover:bg-[#a3833e] text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50"
                  >
                    {isBootstrapping ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Provisionando Superadministrador...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ativar Acesso de Superadministrador</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={logout}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all"
                >
                  Encerrar Sessão
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (onLoginSuccess) {
                        onLoginSuccess();
                      } else {
                        onClose();
                      }
                    }}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#173D2B] hover:bg-[#123022] rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span>Abrir Painel ADM</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#B8954A]" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Method Switcher */}
              <div className="flex border border-neutral-200 bg-neutral-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setAuthMethod('google')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${
                    authMethod === 'google'
                      ? 'bg-white text-[#173D2B] shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Conta Google
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod('email')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${
                    authMethod === 'email'
                      ? 'bg-white text-[#173D2B] shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  E-mail e Senha
                </button>
              </div>

              {authMethod === 'google' ? (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-600 leading-relaxed text-center">
                    Acesso direto com credenciais Google autorizadas da Victoria Lar.
                  </p>

                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded-xl shadow-xs text-sm font-semibold transition-all hover:border-[#B8954A]"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Entrar com Conta Google</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleEmailAuth} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">E-mail Administrativo</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="ex: victorialarresidencial@gmail.com"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#173D2B]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Senha</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Sua senha de acesso"
                        className="w-full pl-9 pr-16 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#173D2B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2 text-[11px] text-neutral-500 hover:text-neutral-800"
                      >
                        {showPassword ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
                    <button
                      type="button"
                      onClick={() => setEmailMode(emailMode === 'login' ? 'register' : 'login')}
                      className="text-[#173D2B] underline hover:text-[#B8954A]"
                    >
                      {emailMode === 'login'
                        ? 'Primeiro acesso? Criar senha'
                        : 'Já possui senha? Faça login'}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#173D2B] hover:bg-[#123022] text-white font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 mt-2"
                  >
                    <span>{emailMode === 'login' ? 'Entrar no Painel' : 'Registrar e Acessar'}</span>
                    <ArrowRight className="w-4 h-4 text-[#B8954A]" />
                  </button>
                </form>
              )}

              <div className="pt-2 border-t border-neutral-200/60">
                <div className="flex items-center gap-2 text-[11px] text-neutral-500 justify-center">
                  <KeyRound className="w-3.5 h-3.5 text-[#B8954A]" />
                  <span>Autenticação direta e protegida via Firebase Auth</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
