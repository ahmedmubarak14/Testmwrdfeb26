import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserRole } from './types/types';
import { useStore } from './store/useStore';
import { useToast } from './hooks/useToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ui/Toast';
import { Sidebar } from './components/Sidebar';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { GetStarted } from './pages/GetStarted';
import { About } from './pages/About';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { authService } from './services/authService';

const getDefaultTabForRole = (role?: UserRole): string => {
  if (role === UserRole.ADMIN) return 'overview';
  return 'dashboard';
};

const ClientPortal = lazy(() =>
  import('./pages/client/ClientPortal').then((module) => ({
    default: module.ClientPortal,
  }))
);

const SupplierPortal = lazy(() =>
  import('./pages/supplier/SupplierPortal').then((module) => ({
    default: module.SupplierPortal,
  }))
);

const AdminPortal = lazy(() =>
  import('./pages/admin/AdminPortal').then((module) => ({
    default: module.AdminPortal,
  }))
);

function App() {
  const { t } = useTranslation();
  const { currentUser, isAuthenticated, isLoading, login, logout, initializeAuth } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initialize auth on mount (restore Supabase session if exists)
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Enforce auth-aware routing and proper landing/app redirects.
  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && currentUser) {
      if (location.pathname === '/' || location.pathname === '/login') {
        const tabFromUrl = new URLSearchParams(location.search).get('tab');
        const nextTab = tabFromUrl || getDefaultTabForRole(currentUser.role);
        navigate(`/app?tab=${encodeURIComponent(nextTab)}`, { replace: true });
      }
      return;
    }

    if (location.pathname.startsWith('/app')) {
      navigate('/login', { replace: true });
    }
  }, [currentUser, isAuthenticated, isLoading, location.pathname, location.search, navigate]);

  // Keep active tab in sync with URL query param while inside /app.
  useEffect(() => {
    if (!location.pathname.startsWith('/app')) return;

    const tabFromUrl = new URLSearchParams(location.search).get('tab');
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
      return;
    }

    const defaultTab = getDefaultTabForRole(currentUser?.role);
    setActiveTab(defaultTab);
    navigate(`/app?tab=${encodeURIComponent(defaultTab)}`, { replace: true });
  }, [currentUser?.role, location.pathname, location.search, navigate]);

  const handleLogin = async (email: string, password: string) => {
    const user = await login(email, password);
    if (user) {
      const initialTab = getDefaultTabForRole(user.role);
      setActiveTab(initialTab);
      navigate(`/app?tab=${encodeURIComponent(initialTab)}`, { replace: true });
      toast.success(t('toast.welcomeBack', { name: user.name }));
      return user.role;
    } else {
      toast.error(t('toast.invalidCredentials'));
      return null;
    }
  };

  const handleLogout = async () => {
    await logout();
    setSidebarOpen(false);
    navigate('/', { replace: true });
    toast.info(t('toast.loggedOut'));
  };

  const handleRequestPasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}/login`;
    const result = await authService.requestPasswordReset(email, redirectTo);

    if (result.success) {
      toast.success(t('login.resetEmailSent', 'Password reset email sent. Check your inbox.'));
    } else {
      toast.error(result.error || t('login.resetEmailFailed', 'Failed to send password reset email'));
    }

    return result;
  };

  const handleCompletePasswordReset = async (newPassword: string) => {
    const result = await authService.updatePassword(newPassword);

    if (result.success) {
      toast.success(t('login.passwordResetSuccess', 'Password updated successfully. Please sign in.'));
      navigate('/login', { replace: true });
    } else {
      toast.error(result.error || t('login.passwordResetFailed', 'Failed to update password'));
    }

    return result;
  };

  const handleTabNavigate = (tab: string) => {
    setActiveTab(tab);
    navigate(`/app?tab=${encodeURIComponent(tab)}`);
  };

  // Show loading spinner while initializing auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      <Routes>
        <Route
          path="/"
          element={
            <Landing
              onNavigateToLogin={() => navigate('/login')}
              onNavigateToGetStarted={() => navigate('/get-started')}
              onNavigateToAboutClients={() => navigate('/about/clients')}
              onNavigateToAboutSuppliers={() => navigate('/about/suppliers')}
            />
          }
        />
        <Route
          path="/login"
          element={
            <Login
              onLogin={handleLogin}
              onBack={() => navigate('/')}
              onNavigateToGetStarted={() => navigate('/get-started')}
              onRequestPasswordReset={handleRequestPasswordReset}
              onCompletePasswordReset={handleCompletePasswordReset}
            />
          }
        />
        <Route
          path="/get-started"
          element={<GetStarted onBack={() => navigate('/')} />}
        />
        <Route
          path="/about/clients"
          element={
            <About
              onNavigateToLogin={() => navigate('/login')}
              onNavigateToGetStarted={() => navigate('/get-started')}
              onBack={() => navigate('/')}
              scrollTo="clients"
            />
          }
        />
        <Route
          path="/about/suppliers"
          element={
            <About
              onNavigateToLogin={() => navigate('/login')}
              onNavigateToGetStarted={() => navigate('/get-started')}
              onBack={() => navigate('/')}
              scrollTo="suppliers"
            />
          }
        />
        <Route
          path="/app"
          element={
            isAuthenticated && currentUser ? (
              <div className="flex min-h-screen w-full bg-[#f9fafb] font-sans text-gray-900">
                <Sidebar
                  role={currentUser.role}
                  activeTab={activeTab}
                  onNavigate={handleTabNavigate}
                  onLogout={handleLogout}
                  isOpen={sidebarOpen}
                  onClose={() => setSidebarOpen(false)}
                />

                <div className="flex-1 flex flex-col min-w-0">
                  <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
                    >
                      <span className="material-symbols-outlined">menu</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="size-6 bg-[#0A2540] rounded flex items-center justify-center text-white">
                        <svg className="size-4" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                          <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor"></path>
                        </svg>
                      </div>
                      <span className="text-[#0A2540] text-lg font-bold">mwrd</span>
                    </div>
                    <div className="w-10"></div>
                  </header>

                  <main className="flex-1 overflow-y-auto bg-gray-50/50">
                    <Suspense
                      fallback={
                        <div className="flex min-h-[320px] items-center justify-center">
                          <LoadingSpinner size="lg" />
                        </div>
                      }
                    >
                      {currentUser.role === UserRole.CLIENT && (
                        <ClientPortal activeTab={activeTab} onNavigate={handleTabNavigate} />
                      )}
                      {currentUser.role === UserRole.SUPPLIER && (
                        <SupplierPortal activeTab={activeTab} onNavigate={handleTabNavigate} />
                      )}
                      {currentUser.role === UserRole.ADMIN && (
                        <AdminPortal activeTab={activeTab} onNavigate={handleTabNavigate} />
                      )}
                    </Suspense>
                  </main>
                </div>
              </div>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? '/app' : '/'} replace />}
        />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
