import React, { useState } from 'react';
import { VictoriaLogo } from './VictoriaLogo';
import { useAuth } from '../context/AuthContext';
import { Shield, User, LogOut, Phone, Calendar, Menu, X } from 'lucide-react';

interface NavbarProps {
  onOpenAdmin: () => void;
  onOpenLogin: () => void;
  onScrollTo: (id: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAdmin, onOpenLogin, onScrollTo }) => {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    onScrollTo(id);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#173D2B] text-white border-b-2 border-[#B8954A] shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo faithful to brand identity (Horizontal Lockup on Dark Green) */}
          <div
            className="cursor-pointer py-1 flex items-center transition-transform hover:scale-[1.02]"
            onClick={() => onScrollTo('hero')}
            title="Victoria Lar Residencial"
          >
            <VictoriaLogo variant="light" size="md" layout="horizontal" />
          </div>

          {/* Desktop Navigation with brand palette gold letters */}
          <nav className="hidden md:flex items-center space-x-8">
            <button
              onClick={() => onScrollTo('sobre')}
              className="text-[#B8954A] hover:text-[#DFC282] font-semibold text-sm tracking-wide transition-colors cursor-pointer"
            >
              Sobre Nós
            </button>
            <button
              onClick={() => onScrollTo('servicos')}
              className="text-[#B8954A] hover:text-[#DFC282] font-semibold text-sm tracking-wide transition-colors cursor-pointer"
            >
              Nossos Serviços
            </button>
            <button
              onClick={() => onScrollTo('diferenciais')}
              className="text-[#B8954A] hover:text-[#DFC282] font-semibold text-sm tracking-wide transition-colors cursor-pointer"
            >
              Estrutura & Cuidado
            </button>
            <button
              onClick={() => onScrollTo('contato')}
              className="text-[#B8954A] hover:text-[#DFC282] font-semibold text-sm tracking-wide transition-colors cursor-pointer"
            >
              Contato & Visitas
            </button>
          </nav>

          {/* Actions area */}
          <div className="flex items-center space-x-3">
            {/* Quick Contact CTA - Botão no tom de rosa do anexo com letras verdes */}
            <button
              onClick={() => onScrollTo('contato')}
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#173D2B] bg-[#E5A2AB] hover:bg-[#DC939D] rounded-full shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-[#173D2B]" />
              Agendar Visita
            </button>

            {/* User session status (Painel ADM button removed as requested - access via shortcut) */}
            {user && (
              <div className="flex items-center gap-2">
                <div className="text-xs text-white/80 bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10">
                  <User className="w-3 h-3 text-[#B8954A]" />
                  <span className="truncate max-w-[120px]">{user.email}</span>
                </div>

                <button
                  onClick={logout}
                  title="Sair"
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile menu toggle button */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              className="md:hidden p-2 text-[#B8954A] hover:text-[#DFC282] hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#173D2B] border-t border-[#B8954A]/30 px-4 pt-3 pb-5 space-y-2.5 shadow-xl animate-in slide-in-from-top duration-200">
          <button
            onClick={() => handleNavClick('sobre')}
            className="w-full text-left py-2.5 px-3 rounded-lg text-[#B8954A] hover:text-[#DFC282] hover:bg-white/5 font-semibold text-sm tracking-wide transition-colors cursor-pointer"
          >
            Sobre Nós
          </button>
          <button
            onClick={() => handleNavClick('servicos')}
            className="w-full text-left py-2.5 px-3 rounded-lg text-[#B8954A] hover:text-[#DFC282] hover:bg-white/5 font-semibold text-sm tracking-wide transition-colors cursor-pointer"
          >
            Nossos Serviços
          </button>
          <button
            onClick={() => handleNavClick('diferenciais')}
            className="w-full text-left py-2.5 px-3 rounded-lg text-[#B8954A] hover:text-[#DFC282] hover:bg-white/5 font-semibold text-sm tracking-wide transition-colors cursor-pointer"
          >
            Estrutura & Cuidado
          </button>
          <button
            onClick={() => handleNavClick('contato')}
            className="w-full text-left py-2.5 px-3 rounded-lg text-[#B8954A] hover:text-[#DFC282] hover:bg-white/5 font-semibold text-sm tracking-wide transition-colors cursor-pointer"
          >
            Contato & Visitas
          </button>
          <div className="pt-2">
            <button
              onClick={() => handleNavClick('contato')}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#173D2B] bg-[#E5A2AB] hover:bg-[#DC939D] rounded-xl shadow-sm transition-all"
            >
              <Calendar className="w-4 h-4 text-[#173D2B]" />
              Agendar Visita
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
