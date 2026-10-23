import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getBootstrapStatus, executeFirstSuperAdminBootstrap, seedInitialContentIfEmpty } from '../services/bootstrapService';
import { BootstrapRecord } from '../types';
import { ShieldAlert, CheckCircle2, Lock, Sparkles, RefreshCw } from 'lucide-react';

interface BootstrapBannerProps {
  onSuccess?: () => void;
}

export const BootstrapBanner: React.FC<BootstrapBannerProps> = ({ onSuccess }) => {
  const { user, signInWithGoogle, refreshAdminProfile, isAdmin } = useAuth();
  const [bootstrapInfo, setBootstrapInfo] = useState<BootstrapRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await getBootstrapStatus();
      setBootstrapInfo(res);
    } catch (err: any) {
      console.warn('Erro ao consultar status de bootstrap:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleExecuteBootstrap = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    try {
      setProcessing(true);
      setErrorMessage(null);
      setMessage('Provisionando primeiro superadministrador e registrando garantias de concorrência...');

      const result = await executeFirstSuperAdminBootstrap(user.uid, user.email || 'superadmin@victorialar.com.br');
      
      // Only seed initial sample services and institutional content if system was not already initialized
      if (!result.alreadyInitialized) {
        await seedInitialContentIfEmpty();
      }

      setMessage(result.message);
      await fetchStatus();
      await refreshAdminProfile();

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao executar bootstrap');
    } finally {
      setProcessing(false);
    }
  };

  // Never show bootstrap/admin setup banner to unauthenticated public visitors
  if (!user) {
    return null;
  }

  // If already locked and user is already an admin, don't show the setup banner
  if (!loading && bootstrapInfo && bootstrapInfo.lockedPermanently && isAdmin) {
    return null;
  }

  // If system is uninitialized OR user is logged in and needs bootstrap
  const isUninitialized = !bootstrapInfo || bootstrapInfo.status === 'UNINITIALIZED' || !bootstrapInfo.lockedPermanently;

  if (!isUninitialized) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-[#173D2B] via-[#1f4f38] to-[#173D2B] text-[#FAF9F5] border-b-2 border-[#B8954A] shadow-md px-4 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3 text-left">
          <div className="p-2 bg-[#B8954A]/20 border border-[#B8954A] rounded-lg text-[#B8954A] flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-[#B8954A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white tracking-wide">
                Configuração Inicial da Victoria Lar Residencial
              </span>
              <span className="text-[10px] bg-[#B8954A] text-black px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Fase 1: Fundação
              </span>
            </div>
            <p className="text-xs text-[#FAF9F5]/80 mt-0.5">
              {user
                ? !user.emailVerified
                  ? `Usuário conectado: ${user.email} (e-mail não verificado). A verificação de e-mail junto ao Google é obrigatória para executar o bootstrap.`
                  : `Usuário conectado: ${user.email}. Clique abaixo para provisionar seu acesso como Primeiro Superadministrador com selo permanente de segurança.`
                : 'O banco de dados do Firebase foi integrado. Conecte-se com sua conta Google para registrar o primeiro Superadministrador do Lar.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          {user ? (
            <button
              onClick={handleExecuteBootstrap}
              disabled={processing || !user.emailVerified}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#B8954A] hover:bg-[#a6843e] text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {processing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Provisionando...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-[#173D2B]" />
                  <span>Provisionar Primeiro Superadministrador</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-[#173D2B] hover:bg-neutral-100 text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#B8954A]" />
              <span>Conectar com Google</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="max-w-7xl mx-auto mt-2 text-xs bg-emerald-900/60 border border-emerald-400/40 text-emerald-200 px-3 py-1.5 rounded-md flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
          <span>{message}</span>
        </div>
      )}

      {errorMessage && (
        <div className="max-w-7xl mx-auto mt-2 text-xs bg-red-900/60 border border-red-400/40 text-red-200 px-3 py-1.5 rounded-md flex items-center gap-2">
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
