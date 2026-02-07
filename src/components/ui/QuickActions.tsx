import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, MessageSquare, Package } from 'lucide-react';

interface QuickActionsProps {
  onNavigate: (tab: string) => void;
  pendingQuotesCount?: number;
  activeOrdersCount?: number;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onNavigate,
  pendingQuotesCount = 0,
  activeOrdersCount = 0,
}) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      <button
        onClick={() => onNavigate('create-rfq')}
        className="flex items-center gap-4 p-5 rounded-lg border border-blue-200 bg-[#137fec] text-white shadow-sm hover:bg-[#137fec]/90 hover:shadow-md transition-all duration-200 group"
      >
        <div className="p-3 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
          <FileText className="w-6 h-6" />
        </div>
        <div className="text-left">
          <p className="font-semibold text-lg">{t('client.dashboard.quickActions.createRfq')}</p>
          <p className="text-sm text-white/80">{t('client.dashboard.quickActions.createRfqDesc')}</p>
        </div>
      </button>

      <button
        onClick={() => onNavigate('rfqs')}
        className="flex items-center gap-4 p-5 rounded-lg border border-green-200 bg-white shadow-sm hover:shadow-md hover:border-green-300 transition-all duration-200 group"
      >
        <div className="p-3 bg-green-100 rounded-lg text-green-600 group-hover:bg-green-200 transition-colors">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="text-left flex-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-lg text-[#111827]">{t('client.dashboard.quickActions.viewQuotes')}</p>
            {pendingQuotesCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                {pendingQuotesCount}
              </span>
            )}
          </div>
          <p className="text-sm text-[#6b7280]">{t('client.dashboard.quickActions.viewQuotesDesc')}</p>
        </div>
      </button>

      <button
        onClick={() => onNavigate('orders')}
        className="flex items-center gap-4 p-5 rounded-lg border border-blue-200 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
      >
        <div className="p-3 bg-blue-100 rounded-lg text-blue-600 group-hover:bg-blue-200 transition-colors">
          <Package className="w-6 h-6" />
        </div>
        <div className="text-left flex-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-lg text-[#111827]">{t('client.dashboard.quickActions.trackOrders')}</p>
            {activeOrdersCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                {activeOrdersCount}
              </span>
            )}
          </div>
          <p className="text-sm text-[#6b7280]">{t('client.dashboard.quickActions.trackOrdersDesc')}</p>
        </div>
      </button>
    </div>
  );
};
