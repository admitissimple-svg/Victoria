import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { AdminPanel } from './components/AdminPanel';
import { AdminLoginModal } from './components/AdminLoginModal';
import { BootstrapBanner } from './components/BootstrapBanner';

function MainApp() {
  const { isAdmin } = useAuth();
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Global administrative shortcut: Ctrl+Shift+A, Ctrl+Alt+A, or Alt+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (isModifier && (e.key === 'a' || e.key === 'A') && (e.shiftKey || e.altKey)) {
        e.preventDefault();
        if (isAdmin) {
          setIsAdminPanelOpen((prev) => !prev);
        } else {
          setIsLoginModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  const handleScrollTo = (id: string) => {
    if (isAdminPanelOpen) {
      setIsAdminPanelOpen(false);
    }
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const [contentRefreshKey, setContentRefreshKey] = useState(0);

  if (isAdminPanelOpen && isAdmin) {
    return (
      <AdminPanel
        onClose={() => {
          setIsAdminPanelOpen(false);
          setContentRefreshKey((prev) => prev + 1);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F5]">
      {/* Bootstrap setup banner if system is pending initialization */}
      <BootstrapBanner
        onSuccess={() => {
          setIsAdminPanelOpen(true);
        }}
      />

      {/* Main Navbar */}
      <Navbar
        onOpenAdmin={() => setIsAdminPanelOpen(true)}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onScrollTo={handleScrollTo}
      />

      {/* Public Landing Page */}
      <main className="flex-1">
        <LandingPage
          key={contentRefreshKey}
          onOpenAdminLogin={() => {
            if (isAdmin) {
              setIsAdminPanelOpen(true);
            } else {
              setIsLoginModalOpen(true);
            }
          }}
        />
      </main>

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={() => {
          setIsLoginModalOpen(false);
          setIsAdminPanelOpen(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
