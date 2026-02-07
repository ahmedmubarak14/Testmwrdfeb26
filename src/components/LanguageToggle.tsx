import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

interface LanguageToggleProps {
  className?: string;
  variant?: 'default' | 'minimal' | 'pill';
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ 
  className = '',
  variant = 'default'
}) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const toggleLanguage = () => {
    const newLang = isArabic ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  if (variant === 'minimal') {
    return (
      <button
        onClick={toggleLanguage}
        className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 transition-colors ${className}`}
        aria-label={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
      >
        <Globe className="w-4 h-4" />
        <span>{isArabic ? 'EN' : 'AR'}</span>
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={toggleLanguage}
        className={`relative flex items-center h-8 p-0.5 rounded-full bg-slate-100 transition-colors ${className}`}
        aria-label={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
      >
        <span 
          className={`flex items-center justify-center w-12 h-7 rounded-full text-xs font-semibold transition-all ${
            !isArabic ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          EN
        </span>
        <span 
          className={`flex items-center justify-center w-12 h-7 rounded-full text-xs font-semibold transition-all ${
            isArabic ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          AR
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleLanguage}
      className={`group inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/50 transition-all text-sm font-medium text-slate-700 hover:text-primary-700 ${className}`}
      aria-label={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <Globe className="w-4 h-4 text-slate-400 group-hover:text-primary-500 transition-colors" />
      <span>{isArabic ? 'English' : 'العربية'}</span>
    </button>
  );
};
