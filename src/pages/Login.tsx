import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../types/types';
import { LanguageToggle } from '../components/LanguageToggle';
import type { ActionResponse } from '../services/authService';

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<UserRole | null>;
  onBack: () => void;
  onNavigateToGetStarted: () => void;
  onRequestPasswordReset: (email: string) => Promise<ActionResponse>;
  onCompletePasswordReset: (newPassword: string) => Promise<ActionResponse>;
}

type LoginMode = 'login' | 'request-reset' | 'recovery';

export const Login: React.FC<LoginProps> = ({
  onLogin,
  onBack,
  onNavigateToGetStarted,
  onRequestPasswordReset,
  onCompletePasswordReset,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<LoginMode>(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return hashParams.get('type') === 'recovery' ? 'recovery' : 'login';
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode !== 'login') {
      return;
    }

    setIsLoading(true);

    try {
      await onLogin(email, password);
    } catch (error) {
      logger.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await onRequestPasswordReset(email.trim());
      if (result.success) {
        setMode('login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await onCompletePasswordReset(newPassword);
      if (result.success) {
        setMode('login');
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200 p-3 sm:p-4 font-sans">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl flex overflow-hidden max-w-5xl w-full min-h-[600px] sm:min-h-[650px] animate-in zoom-in-95 duration-300">
        
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center relative">
          <div className="absolute top-4 sm:top-6 md:top-8 end-4 sm:end-6 md:end-8">
            <LanguageToggle />
          </div>

          <button 
            data-testid="login-back-button"
            onClick={onBack}
            className="flex items-center gap-3 mb-8 sm:mb-12 hover:opacity-80 transition-opacity min-h-[44px]"
          >
            <div className="size-8 bg-[#0A2540] rounded-lg flex items-center justify-center text-white">
              <svg className="size-5" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor"></path>
              </svg>
            </div>
            <span className="text-[#0A2540] text-xl sm:text-2xl font-bold tracking-tight">{t('brand.name')}</span>
          </button>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
            {mode === 'recovery'
              ? t('login.resetPasswordTitle', 'Reset Password')
              : mode === 'request-reset'
                ? t('login.forgotPassword', 'Forgot Password?')
                : t('login.title')}
          </h1>
          <p className="text-slate-500 mb-6 sm:mb-8 text-sm sm:text-base">
            {mode === 'recovery'
              ? t('login.resetPasswordSubtitle', 'Choose a new password for your account.')
              : mode === 'request-reset'
                ? t('login.resetEmailSubtitle', 'Enter your email and we will send a reset link.')
                : t('login.subtitle')}
          </p>

          {mode === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div className="space-y-1">
                <input
                  data-testid="login-email-input"
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 sm:py-3.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all text-base"
                />
              </div>

              <div className="space-y-1 relative">
                <input
                  data-testid="login-password-input"
                  type="password"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 sm:py-3.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all text-base"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMode('request-reset')}
                  className="text-sm text-blue-600 hover:underline min-h-[32px]"
                >
                  {t('login.forgotPassword')}
                </button>
              </div>

              <button
                data-testid="login-submit-button"
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0A2540] hover:bg-[#0A2540]/90 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 min-h-[48px]"
              >
                {isLoading ? (
                  <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                ) : (
                  t('common.login')
                )}
              </button>
            </form>
          )}

          {mode === 'request-reset' && (
            <form onSubmit={handleRequestReset} className="space-y-4 sm:space-y-5">
              <input
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 sm:py-3.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all text-base"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0A2540] hover:bg-[#0A2540]/90 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 min-h-[48px]"
              >
                {isLoading ? (
                  <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                ) : (
                  t('login.sendResetLink', 'Send Reset Link')
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-sm text-slate-600 hover:text-slate-800"
              >
                {t('common.back', 'Back')}
              </button>
            </form>
          )}

          {mode === 'recovery' && (
            <form onSubmit={handleCompleteReset} className="space-y-4 sm:space-y-5">
              <input
                type="password"
                placeholder={t('login.newPassword', 'New password')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 sm:py-3.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all text-base"
              />
              <input
                type="password"
                placeholder={t('login.confirmPassword', 'Confirm password')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 sm:py-3.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all text-base"
              />
              <button
                type="submit"
                disabled={isLoading || newPassword.length < 8 || newPassword !== confirmPassword}
                className="w-full bg-[#0A2540] hover:bg-[#0A2540]/90 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                ) : (
                  t('login.resetPasswordAction', 'Update Password')
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-sm text-slate-600 hover:text-slate-800"
              >
                {t('common.back', 'Back')}
              </button>
            </form>
          )}

          <div className="mt-6 sm:mt-8 text-center">
            {mode === 'login' ? (
              <p className="text-slate-500 text-sm">
                {t('login.noAccount')}{' '}
                <button onClick={onNavigateToGetStarted} className="text-blue-600 font-bold hover:underline min-h-[44px] inline-flex items-center">
                  {t('login.signUp')}
                </button>
              </p>
            ) : (
              <p className="text-slate-500 text-sm">{t('login.backToSignIn', 'Return to sign in when ready.')}</p>
            )}
          </div>
        </div>

        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-slate-100 to-slate-300 relative flex-col justify-center p-12 lg:p-16 overflow-hidden">
          <div className="absolute inset-0 opacity-40">
             <svg className="absolute top-0 right-0 w-full h-full" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M350 50L400 80V140L350 170L300 140V80L350 50Z" stroke="#94a3b8" strokeWidth="1" fill="none" opacity="0.5"/>
                <path d="M50 300L100 330V390L50 420L0 390V330L50 300Z" stroke="#94a3b8" strokeWidth="1" fill="none" opacity="0.5"/>
                <path d="M200 200L250 230V290L200 320L150 290V230L200 200Z" stroke="#94a3b8" strokeWidth="1" fill="none" opacity="0.3"/>
                <circle cx="350" cy="80" r="3" fill="#94a3b8" opacity="0.5" />
                <circle cx="50" cy="330" r="3" fill="#94a3b8" opacity="0.5" />
                <line x1="350" y1="170" x2="250" y2="230" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" opacity="0.3"/>
             </svg>
          </div>

          <div className="relative z-10 max-w-md">
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-800 mb-6 leading-tight">
              {t('landing.heroTitle')}
            </h2>
            <p className="text-slate-600 text-lg leading-relaxed">
              {t('landing.heroSubtitle')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
