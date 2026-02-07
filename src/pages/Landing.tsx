import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { LanguageToggle } from '../components/LanguageToggle';

interface LandingProps {
  onNavigateToLogin: () => void;
  onNavigateToGetStarted: () => void;
  onNavigateToAboutClients: () => void;
  onNavigateToAboutSuppliers: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onNavigateToLogin, onNavigateToGetStarted, onNavigateToAboutClients, onNavigateToAboutSuppliers }) => {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const heroImageRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.fromTo(
      heroTextRef.current?.querySelector('h1'),
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1 }
    )
    .fromTo(
      heroTextRef.current?.querySelector('p'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.8 },
      '-=0.6'
    )
    .fromTo(
      heroTextRef.current?.querySelectorAll('button'),
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 },
      '-=0.4'
    )
    .fromTo(
      heroImageRef.current,
      { opacity: 0, scale: 1.05 },
      { opacity: 1, scale: 1, duration: 1.2, ease: 'power2.out' },
      '-=0.8'
    );

    gsap.set(heroTextRef.current, { opacity: 1 });

    gsap.to(heroImageRef.current?.querySelector('.hero-bg-image'), {
      scale: 1.08,
      duration: 20,
      ease: 'none',
      repeat: -1,
      yoyo: true
    });

    const featureCards = featuresRef.current?.querySelectorAll('.feature-card');
    if (featureCards) {
      gsap.fromTo(
        featureCards,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.1,
          ease: 'power2.out',
          delay: 0.5
        }
      );
    }
  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="relative flex min-h-screen w-full flex-col overflow-x-hidden font-sans bg-[#F6F9FC] text-[#4A4A4A]">
      <header className="sticky top-0 z-50 bg-[#F6F9FC]/80 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between border-b border-solid border-gray-200 py-3 md:py-4">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="size-6 text-[#0A2540]">
                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor"></path>
                </svg>
              </div>
              <h2 className="text-[#0A2540] text-lg md:text-xl font-bold leading-tight tracking-[-0.015em]">{t('brand.name')}</h2>
            </div>
            <nav className="hidden md:flex flex-1 justify-center items-center gap-8">
              <button onClick={onNavigateToAboutClients} className="text-[#4A4A4A] text-sm font-medium leading-normal hover:text-[#0A2540]">{t('landing.forClients')}</button>
              <button onClick={onNavigateToAboutSuppliers} className="text-[#4A4A4A] text-sm font-medium leading-normal hover:text-[#0A2540]">{t('landing.forSuppliers')}</button>
            </nav>
            <div className="flex gap-1.5 md:gap-2 items-center">
              <LanguageToggle variant="minimal" />
              <button 
                data-testid="landing-login-button"
                onClick={onNavigateToLogin}
                className="hidden sm:flex min-w-[60px] md:min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-8 md:h-10 px-2.5 md:px-4 bg-gray-200 text-[#4A4A4A] text-xs md:text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-300 transition-colors"
              >
                <span className="truncate">{t('common.login')}</span>
              </button>
              <button 
                onClick={onNavigateToGetStarted}
                className="hidden sm:flex min-w-[70px] md:min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-8 md:h-10 px-2.5 md:px-4 bg-[#0A2540] text-white text-xs md:text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#0A2540]/90 transition-colors"
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
                  onClick={() => { onNavigateToAboutClients(); setMobileMenuOpen(false); }}
                  className="text-[#4A4A4A] text-base font-medium py-3 px-3 rounded-lg hover:bg-gray-100 hover:text-[#0A2540] transition-colors text-start min-h-[44px]"
                >
                  {t('landing.forClients')}
                </button>
                <button 
                  onClick={() => { onNavigateToAboutSuppliers(); setMobileMenuOpen(false); }}
                  className="text-[#4A4A4A] text-base font-medium py-3 px-3 rounded-lg hover:bg-gray-100 hover:text-[#0A2540] transition-colors text-start min-h-[44px]"
                >
                  {t('landing.forSuppliers')}
                </button>
              </nav>
              <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                <button 
                  onClick={() => { onNavigateToLogin(); setMobileMenuOpen(false); }}
                  className="w-full flex cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-gray-200 text-[#4A4A4A] text-sm font-bold leading-normal tracking-[0.015em] hover:bg-gray-300 transition-colors"
                >
                  {t('common.login')}
                </button>
                <button 
                  onClick={() => { onNavigateToGetStarted(); setMobileMenuOpen(false); }}
                  className="w-full flex cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-[#0A2540] text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#0A2540]/90 transition-colors"
                >
                  {t('landing.getStarted')}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex flex-col">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div ref={heroTextRef} className="flex flex-col gap-8 text-center lg:text-start rtl:lg:text-end opacity-0">
                <div className="flex flex-col gap-4">
                  <h1 className="text-[#0A2540] text-4xl font-black leading-tight tracking-tighter md:text-5xl lg:text-6xl">
                    {t('landing.heroTitle')}
                  </h1>
                  <p className="text-[#6b7280] text-lg font-normal leading-normal md:text-xl">
                    {t('landing.heroSubtitle')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 justify-center lg:justify-start rtl:lg:justify-end">
                  <button 
                    onClick={onNavigateToGetStarted}
                    className="flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-6 bg-[#0A2540] text-white text-base font-bold leading-normal tracking-[0.015em] hover:bg-[#0A2540]/90 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                  >
                    <span className="truncate">{t('landing.getStarted')}</span>
                  </button>
                  <button 
                    data-testid="landing-hero-login-button"
                    onClick={onNavigateToLogin}
                    className="flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-6 bg-gray-200 text-[#4A4A4A] text-base font-bold leading-normal tracking-[0.015em] hover:bg-gray-300 transition-all duration-300 hover:scale-105"
                  >
                    <span className="truncate">{t('common.login')}</span>
                  </button>
                </div>
              </div>
              <div 
                ref={heroImageRef}
                className="relative w-full aspect-square md:aspect-video lg:aspect-square rounded-xl shadow-2xl overflow-hidden opacity-0"
              >
                <div 
                  className="hero-bg-image absolute inset-0 bg-center bg-no-repeat bg-cover"
                  style={{ 
                    backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB-zjAFJBV1Bx_1I3HkSkalvXrI-beVvnJr7J8L_JG2iD_PAZ5sdu5XAodzu-6N56qYmWJohKy7Klh11QTew7zNlSBuYfSV8A5M6XVxZyE9LEHQaYDW5rMt2SGr1GmnTcM85qh6Mwk3K3g2ky7XQAMToRe4YbXtX0HtN-mpFK5maRo3VmpGNCLD2JNCzRvWGiUUfp8EJynGxWom-KOu-a5HU4IBeeuOUugn2TtuP8ghrHnkx_AmRlVVXdSR9f49z_2NRWPJLWTwE5XW")'
                  }}
                />
                <div 
                  className="absolute inset-0 bg-gradient-to-tr from-[#0A2540]/10 via-transparent to-[#00C49A]/10"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="flex flex-col gap-12">
              <div className="text-center">
                <h2 className="text-[#0A2540] text-3xl md:text-4xl font-bold">{t('landing.features.title', { brandName: t('brand.name') })}</h2>
              </div>
              <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="feature-card flex flex-1 gap-4 rounded-xl border border-gray-200 bg-white/50 p-6 flex-col transition-all duration-300 hover:shadow-lg hover:border-[#00C49A]/50 hover:-translate-y-1">
                  <span className="material-symbols-outlined text-[#00C49A] text-3xl">verified_user</span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-[#0A2540] text-lg font-bold leading-tight">{t('landing.features.verified')}</h3>
                    <p className="text-[#6b7280] text-sm font-normal leading-normal">{t('landing.features.verifiedDesc')}</p>
                  </div>
                </div>
                <div className="feature-card flex flex-1 gap-4 rounded-xl border border-gray-200 bg-white/50 p-6 flex-col transition-all duration-300 hover:shadow-lg hover:border-[#00C49A]/50 hover:-translate-y-1">
                  <span className="material-symbols-outlined text-[#00C49A] text-3xl">shopping_cart_checkout</span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-[#0A2540] text-lg font-bold leading-tight">{t('landing.features.competitive')}</h3>
                    <p className="text-[#6b7280] text-sm font-normal leading-normal">{t('landing.features.competitiveDesc')}</p>
                  </div>
                </div>
                <div className="feature-card flex flex-1 gap-4 rounded-xl border border-gray-200 bg-white/50 p-6 flex-col transition-all duration-300 hover:shadow-lg hover:border-[#00C49A]/50 hover:-translate-y-1">
                  <span className="material-symbols-outlined text-[#00C49A] text-3xl">dashboard</span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-[#0A2540] text-lg font-bold leading-tight">{t('landing.features.streamlined')}</h3>
                    <p className="text-[#6b7280] text-sm font-normal leading-normal">{t('landing.features.streamlinedDesc')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="bg-[#0A2540] text-white">
          <div className="container mx-auto px-4 py-16">
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-12">
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="size-6 text-white">
                    <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor"></path></svg>
                  </div>
                  <h2 className="text-white text-xl font-bold">{t('brand.name')}</h2>
                </div>
                <p className="text-sm text-gray-300">{t('landing.subtitle')}</p>
              </div>
              <div className="flex flex-col gap-4">
                <h4 className="font-bold text-white">{t('footer.platform')}</h4>
                <button onClick={onNavigateToAboutClients} className="text-sm text-gray-300 hover:text-white">{t('landing.forClients')}</button>
                <button onClick={onNavigateToAboutSuppliers} className="text-sm text-gray-300 hover:text-white">{t('landing.forSuppliers')}</button>
              </div>
            </div>
            <div className="mt-12 border-t border-gray-100/20 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-300">
              <p>{t('footer.copyright', { brandName: t('brand.name') })}</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
