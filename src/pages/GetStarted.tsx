import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { LanguageToggle } from '../components/LanguageToggle';
import { leadsService } from '../services/leadsService';

interface GetStartedProps {
  onBack: () => void;
}

const getStartedSchema = z.object({
  name: z.string().min(2, 'Your name is required'),
  companyName: z.string().min(2, 'Company name is required'),
  accountType: z.string().min(1, 'Please select an account type').refine(
    (val) => ['client', 'supplier'].includes(val),
    { message: 'Please select a valid account type' }
  ),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(8, 'Please enter a valid phone number'),
  notes: z.string().optional()
});

type GetStartedFormData = z.infer<typeof getStartedSchema>;

export const GetStarted: React.FC<GetStartedProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<GetStartedFormData>({
    resolver: zodResolver(getStartedSchema)
  });

  const onSubmit = async (data: GetStartedFormData) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Save lead to database
      const lead = await leadsService.submitLead({
        name: data.name,
        company_name: data.companyName,
        email: data.email,
        phone: data.phone,
        account_type: data.accountType as 'client' | 'supplier',
        notes: data.notes
      });

      logger.info('Lead submitted successfully', {
        accountType: data.accountType
      });
      setIsSubmitted(true);

    } catch (error: any) {
      logger.error('Error submitting lead:', error);
      setErrorMessage(error.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F9FC] p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-lg w-full text-center animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-green-600 text-4xl">check_circle</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0A2540] mb-4">{t('getStarted.successTitle')}</h1>
          <p className="text-[#6b7280] mb-8">{t('getStarted.successMessage')}</p>
          <button
            onClick={onBack}
            className="w-full bg-[#0A2540] hover:bg-[#0A2540]/90 text-white font-bold py-3.5 rounded-lg transition-all"
          >
            {t('getStarted.backToHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F9FC] p-3 sm:p-4 font-sans">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden max-w-5xl w-full min-h-[650px] sm:min-h-[700px] animate-in zoom-in-95 duration-300">

        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center relative">
          <div className="absolute top-4 sm:top-6 md:top-8 end-4 sm:end-6 md:end-8">
            <LanguageToggle />
          </div>

          <button
            onClick={onBack}
            className="flex items-center gap-3 mb-6 sm:mb-8 hover:opacity-80 transition-opacity min-h-[44px]"
          >
            <div className="size-8 bg-[#0A2540] rounded-lg flex items-center justify-center text-white">
              <svg className="size-5" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor"></path>
              </svg>
            </div>
            <span className="text-[#0A2540] text-xl sm:text-2xl font-bold tracking-tight">{t('brand.name')}</span>
          </button>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">{t('getStarted.title')}</h1>
          <p className="text-slate-500 mb-5 sm:mb-6 text-sm sm:text-base">{t('getStarted.subtitle')}</p>

          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('getStarted.yourName') || 'Your Name'}</label>
              <input
                {...register('name')}
                type="text"
                placeholder={t('getStarted.yourNamePlaceholder') || 'Enter your full name'}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all"
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message || t('getStarted.errors.name')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('getStarted.companyName')}</label>
              <input
                {...register('companyName')}
                type="text"
                placeholder={t('getStarted.companyNamePlaceholder')}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all"
              />
              {errors.companyName && (
                <p className="text-red-500 text-sm mt-1">{t('getStarted.errors.companyName')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('getStarted.accountType')}</label>
              <select
                {...register('accountType')}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all bg-white"
              >
                <option value="">{t('getStarted.selectAccountType')}</option>
                <option value="client">{t('getStarted.client')}</option>
                <option value="supplier">{t('getStarted.supplier')}</option>
              </select>
              {errors.accountType && (
                <p className="text-red-500 text-sm mt-1">{t('getStarted.errors.accountType')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('getStarted.email')}</label>
              <input
                {...register('email')}
                type="email"
                placeholder={t('getStarted.emailPlaceholder')}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all"
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{t('getStarted.errors.email')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('getStarted.phone')}</label>
              <input
                {...register('phone')}
                type="tel"
                placeholder={t('getStarted.phonePlaceholder')}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all"
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{t('getStarted.errors.phone')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('getStarted.notes')} <span className="text-slate-400">({t('getStarted.optional')})</span></label>
              <textarea
                {...register('notes')}
                rows={3}
                placeholder={t('getStarted.notesPlaceholder')}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0A2540] hover:bg-[#0A2540]/90 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 mt-4 sm:mt-6 min-h-[48px]"
            >
              {isLoading ? (
                <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
              ) : (
                t('getStarted.submitButton')
              )}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-4 sm:mt-6">{t('getStarted.privacyNote')}</p>
        </div>

        <div className="hidden sm:flex md:w-1/2 bg-slate-50 relative flex-col justify-center p-6 sm:p-8 md:p-12 lg:p-16 overflow-hidden order-first md:order-last border-b md:border-b-0 md:border-s border-slate-200">
          <div className="absolute inset-0 opacity-10">
            <svg className="absolute top-0 right-0 w-full h-full" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M350 50L400 80V140L350 170L300 140V80L350 50Z" stroke="#0A2540" strokeWidth="1" fill="none" opacity="0.5" />
              <path d="M50 300L100 330V390L50 420L0 390V330L50 300Z" stroke="#0A2540" strokeWidth="1" fill="none" opacity="0.5" />
              <path d="M200 200L250 230V290L200 320L150 290V230L200 200Z" stroke="#0A2540" strokeWidth="1" fill="none" opacity="0.3" />
              <circle cx="350" cy="80" r="3" fill="#0A2540" opacity="0.5" />
              <circle cx="50" cy="330" r="3" fill="#0A2540" opacity="0.5" />
              <line x1="350" y1="170" x2="250" y2="230" stroke="#0A2540" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
            </svg>
          </div>

          <div className="relative z-10 max-w-md">
            <h2 className="text-3xl lg:text-4xl font-bold text-[#0A2540] mb-6 leading-tight">
              {t('getStarted.sidebarTitle')}
            </h2>
            <p className="text-slate-600 text-lg leading-relaxed mb-8">
              {t('getStarted.sidebarSubtitle')}
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-[#0A2540]">
                <span className="material-symbols-outlined text-[#00C49A]">check_circle</span>
                <span className="font-medium">{t('getStarted.benefit1')}</span>
              </div>
              <div className="flex items-center gap-3 text-[#0A2540]">
                <span className="material-symbols-outlined text-[#00C49A]">check_circle</span>
                <span className="font-medium">{t('getStarted.benefit2')}</span>
              </div>
              <div className="flex items-center gap-3 text-[#0A2540]">
                <span className="material-symbols-outlined text-[#00C49A]">check_circle</span>
                <span className="font-medium">{t('getStarted.benefit3')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
