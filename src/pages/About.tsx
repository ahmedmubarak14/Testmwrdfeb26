import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '../components/LanguageToggle';

interface AboutProps {
  onNavigateToLogin: () => void;
  onNavigateToGetStarted: () => void;
  onBack: () => void;
  scrollTo?: 'clients' | 'suppliers';
}

export const About: React.FC<AboutProps> = ({ 
  onNavigateToLogin, 
  onNavigateToGetStarted, 
  onBack,
  scrollTo 
}) => {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const clientsRef = useRef<HTMLElement>(null);
  const suppliersRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollTo) {
      // Add a small delay to ensure DOM is fully rendered before scrolling
      // This is especially important on mobile devices
      const timer = setTimeout(() => {
        if (scrollTo === 'clients' && clientsRef.current) {
          clientsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (scrollTo === 'suppliers' && suppliersRef.current) {
          suppliersRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollTo]);

  return (
    <div className="min-h-screen bg-[#F6F9FC]">
      <header className="sticky top-0 z-50 bg-[#F6F9FC]/80 backdrop-blur-sm border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-3 md:py-4">
            <button onClick={onBack} className="flex items-center gap-2 md:gap-4 hover:opacity-80 transition-opacity min-h-[44px]">
              <div className="size-6 text-[#0A2540]">
                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor"></path>
                </svg>
              </div>
              <h2 className="text-[#0A2540] text-lg md:text-xl font-bold leading-tight tracking-[-0.015em]">{t('brand.name')}</h2>
            </button>
            <nav className="hidden md:flex flex-1 justify-center items-center gap-8">
              <button 
                onClick={() => clientsRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#4A4A4A] text-sm font-medium leading-normal hover:text-[#0A2540] min-h-[44px] flex items-center"
              >
                {t('landing.forClients')}
              </button>
              <button 
                onClick={() => suppliersRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#4A4A4A] text-sm font-medium leading-normal hover:text-[#0A2540] min-h-[44px] flex items-center"
              >
                {t('landing.forSuppliers')}
              </button>
            </nav>
            <div className="flex gap-1.5 md:gap-2 items-center">
              <LanguageToggle variant="minimal" />
              <button 
                onClick={onNavigateToLogin}
                className="hidden sm:flex min-w-[60px] md:min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 md:h-11 px-3 md:px-4 bg-gray-200 text-[#4A4A4A] text-xs md:text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-300 transition-colors"
              >
                <span className="truncate">{t('common.login')}</span>
              </button>
              <button 
                onClick={onNavigateToGetStarted}
                className="hidden sm:flex min-w-[70px] md:min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 md:h-11 px-3 md:px-4 bg-[#0A2540] text-white text-xs md:text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#0A2540]/90 transition-colors"
              >
                <span className="truncate">{t('landing.getStarted')}</span>
              </button>
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex md:hidden items-center justify-center size-11 rounded-lg hover:bg-gray-200 transition-colors"
                aria-label="Toggle menu"
              >
                <span className="material-symbols-outlined text-[#0A2540]">
                  {mobileMenuOpen ? 'close' : 'menu'}
                </span>
              </button>
            </div>
          </div>
        </div>
        
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-200 shadow-lg animate-in slide-in-from-top-2 duration-200">
            <div className="container mx-auto px-4 py-4">
              <nav className="flex flex-col gap-1 mb-4">
                <button 
                  onClick={() => { clientsRef.current?.scrollIntoView({ behavior: 'smooth' }); setMobileMenuOpen(false); }}
                  className="text-[#4A4A4A] text-base font-medium py-3 px-3 rounded-lg hover:bg-gray-100 hover:text-[#0A2540] transition-colors text-start min-h-[44px]"
                >
                  {t('landing.forClients')}
                </button>
                <button 
                  onClick={() => { suppliersRef.current?.scrollIntoView({ behavior: 'smooth' }); setMobileMenuOpen(false); }}
                  className="text-[#4A4A4A] text-base font-medium py-3 px-3 rounded-lg hover:bg-gray-100 hover:text-[#0A2540] transition-colors text-start min-h-[44px]"
                >
                  {t('landing.forSuppliers')}
                </button>
              </nav>
              <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                <button 
                  onClick={() => { onNavigateToLogin(); setMobileMenuOpen(false); }}
                  className="w-full flex cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-gray-200 text-[#4A4A4A] text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-300 transition-colors"
                >
                  {t('common.login')}
                </button>
                <button 
                  onClick={() => { onNavigateToGetStarted(); setMobileMenuOpen(false); }}
                  className="w-full flex cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-[#0A2540] text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#0A2540]/90 transition-colors"
                >
                  {t('landing.getStarted')}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        <section ref={clientsRef} id="clients" className="py-16 md:py-24 scroll-mt-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="flex flex-col gap-6">
                <div className="inline-flex items-center gap-2 bg-[#00C49A]/10 text-[#00C49A] px-4 py-2 rounded-full w-fit">
                  <span className="material-symbols-outlined text-xl">storefront</span>
                  <span className="text-sm font-semibold">{t('landing.forClients')}</span>
                </div>
                <h2 className="text-[#0A2540] text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                  {t('about.clients.title')}
                </h2>
                <p className="text-[#6b7280] text-lg leading-relaxed">
                  {t('about.clients.description')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#00C49A] text-2xl mt-0.5">verified</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.clients.benefit1.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.clients.benefit1.desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#00C49A] text-2xl mt-0.5">request_quote</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.clients.benefit2.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.clients.benefit2.desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#00C49A] text-2xl mt-0.5">sell</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.clients.benefit3.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.clients.benefit3.desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#00C49A] text-2xl mt-0.5">support_agent</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.clients.benefit4.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.clients.benefit4.desc')}</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={onNavigateToGetStarted}
                  className="mt-4 w-fit flex cursor-pointer items-center justify-center gap-2 rounded-lg h-12 px-6 bg-[#0A2540] text-white text-base font-bold hover:bg-[#0A2540]/90 transition-colors"
                >
                  {t('about.clients.cta')}
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
              <div className="relative">
                <div className="bg-gradient-to-br from-[#00C49A]/20 to-[#0A2540]/10 rounded-2xl p-8 aspect-square flex items-center justify-center">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-[#0A2540] text-8xl md:text-9xl">shopping_bag</span>
                    <p className="mt-4 text-[#0A2540] font-medium">{t('about.clients.imageCaption')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section ref={suppliersRef} id="suppliers" className="py-16 md:py-24 bg-white scroll-mt-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="relative order-2 lg:order-1">
                <div className="bg-gradient-to-br from-[#0A2540]/10 to-[#00C49A]/20 rounded-2xl p-8 aspect-square flex items-center justify-center">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-[#0A2540] text-8xl md:text-9xl">inventory_2</span>
                    <p className="mt-4 text-[#0A2540] font-medium">{t('about.suppliers.imageCaption')}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-6 order-1 lg:order-2">
                <div className="inline-flex items-center gap-2 bg-[#0A2540]/10 text-[#0A2540] px-4 py-2 rounded-full w-fit">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                  <span className="text-sm font-semibold">{t('landing.forSuppliers')}</span>
                </div>
                <h2 className="text-[#0A2540] text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                  {t('about.suppliers.title')}
                </h2>
                <p className="text-[#6b7280] text-lg leading-relaxed">
                  {t('about.suppliers.description')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-start gap-3 p-4 bg-[#F6F9FC] rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#0A2540] text-2xl mt-0.5">groups</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.suppliers.benefit1.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.suppliers.benefit1.desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-[#F6F9FC] rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#0A2540] text-2xl mt-0.5">trending_up</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.suppliers.benefit2.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.suppliers.benefit2.desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-[#F6F9FC] rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#0A2540] text-2xl mt-0.5">payments</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.suppliers.benefit3.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.suppliers.benefit3.desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-[#F6F9FC] rounded-xl border border-gray-100">
                    <span className="material-symbols-outlined text-[#0A2540] text-2xl mt-0.5">analytics</span>
                    <div>
                      <h4 className="font-semibold text-[#0A2540]">{t('about.suppliers.benefit4.title')}</h4>
                      <p className="text-sm text-[#6b7280]">{t('about.suppliers.benefit4.desc')}</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={onNavigateToGetStarted}
                  className="mt-4 w-fit flex cursor-pointer items-center justify-center gap-2 rounded-lg h-12 px-6 bg-[#00C49A] text-white text-base font-bold hover:bg-[#00C49A]/90 transition-colors"
                >
                  {t('about.suppliers.cta')}
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-[#0A2540]">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-white text-3xl md:text-4xl font-bold mb-4">{t('about.cta.title')}</h2>
            <p className="text-gray-300 text-lg mb-8 max-w-2xl mx-auto">{t('about.cta.description')}</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button 
                onClick={onNavigateToGetStarted}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg h-12 px-8 bg-[#00C49A] text-white text-base font-bold hover:bg-[#00C49A]/90 transition-colors"
              >
                {t('landing.getStarted')}
              </button>
              <button 
                onClick={onNavigateToLogin}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg h-12 px-8 bg-white/10 text-white text-base font-bold hover:bg-white/20 transition-colors border border-white/20"
              >
                {t('common.login')}
              </button>
            </div>
          </div>
        </section>

        <footer className="bg-[#0A2540] border-t border-white/10">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row justify-between items-center text-sm text-gray-400">
              <p>{t('footer.copyright', { brandName: t('brand.name') })}</p>
              <button onClick={onBack} className="mt-4 md:mt-0 hover:text-white transition-colors">
                {t('common.backToHome')}
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
