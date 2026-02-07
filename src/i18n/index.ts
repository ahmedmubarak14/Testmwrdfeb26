import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

const updateDocumentDirection = (lng: string) => {
  const isRTL = RTL_LANGUAGES.includes(lng);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar }
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: true
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

updateDocumentDirection(i18n.language);

i18n.on('languageChanged', (lng) => {
  updateDocumentDirection(lng);
});

export const translateStatus = (status: string): string => {
  if (!status) return '';
  
  const normalized = status
    .toLowerCase()
    .replace(/_/g, '')
    .replace(/-/g, '');
  
  const statusMap: Record<string, string> = {
    'open': 'status.open',
    'quoted': 'status.quoted',
    'closed': 'status.closed',
    'pending': 'status.pending',
    'approved': 'status.approved',
    'rejected': 'status.rejected',
    'pendingadmin': 'status.pendingAdmin',
    'senttoclient': 'status.sentToClient',
    'accepted': 'status.accepted',
    'intransit': 'status.inTransit',
    'delivered': 'status.delivered',
    'cancelled': 'status.cancelled',
    'pendingpayment': 'status.pendingPayment',
    'paymentconfirmed': 'status.paymentConfirmed',
    'awaitingconfirmation': 'status.awaiting_confirmation',
    'pendingapproval': 'status.pendingApproval',
    'live': 'supplier.products.live',
  };

  const key = statusMap[normalized];
  if (key) {
    return i18n.t(key);
  }
  
  return status;
};

export default i18n;
