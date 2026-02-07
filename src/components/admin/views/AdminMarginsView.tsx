import React from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../../ui/StatusBadge';
import { ClientMarginModal } from '../ClientMarginModal';
import RFQMarginModal from '../RFQMarginModal';
import { Product, Quote, RFQ, User } from '../../../types/types';
import { SystemConfig } from '../../../types/types';

interface MarginSetting {
  category: string | null;
  marginPercent: number;
}

interface MarginData {
  value: number;
  source: string;
  type: string;
}

interface AdminMarginsViewProps {
  systemConfig: SystemConfig;
  marginSettings: MarginSetting[];
  users: User[];
  rfqs: RFQ[];
  products: Product[];
  quotes: Quote[];
  marginClientSearchTerm: string;
  onMarginClientSearchTermChange: (value: string) => void;
  clientWidgetSearch: string;
  onClientWidgetSearchChange: (value: string) => void;
  rfqWidgetSearch: string;
  onRfqWidgetSearchChange: (value: string) => void;
  onGlobalMarginChange: (value: number) => void;
  onCategoryMarginChange: (category: string, value: number) => void;
  onOpenClientMarginModal: (client: User) => void;
  onOpenRFQMarginModal: (rfqId: string, currentMargin: number) => void;
  getEffectiveMarginData: (quote: Quote, category: string) => MarginData;
  getQuoteCategory: (quote: Quote) => string;
  onManualMarginChange: (quoteId: string, value: number) => void;
  onResetQuoteMargin: (quoteId: string) => void;
  onSendQuoteToClient: (quoteId: string) => void;
  clientMarginClient: User | null;
  isClientMarginModalOpen: boolean;
  onCloseClientMarginModal: () => void;
  onSaveClientMargin: (clientId: string, margin: number) => Promise<void>;
  isClientMarginSubmitting: boolean;
  selectedRFQForMargin: any;
  isRFQMarginModalOpen: boolean;
  onCloseRFQMarginModal: () => void;
  currentRFQMargin: number;
  onSaveRFQMargin: (rfqId: string, margin: number) => Promise<void>;
  isRFQMarginSubmitting: boolean;
}

export const AdminMarginsView: React.FC<AdminMarginsViewProps> = ({
  systemConfig,
  marginSettings,
  users,
  rfqs,
  products,
  quotes,
  marginClientSearchTerm,
  onMarginClientSearchTermChange,
  clientWidgetSearch,
  onClientWidgetSearchChange,
  rfqWidgetSearch,
  onRfqWidgetSearchChange,
  onGlobalMarginChange,
  onCategoryMarginChange,
  onOpenClientMarginModal,
  onOpenRFQMarginModal,
  getEffectiveMarginData,
  getQuoteCategory,
  onManualMarginChange,
  onResetQuoteMargin,
  onSendQuoteToClient,
  clientMarginClient,
  isClientMarginModalOpen,
  onCloseClientMarginModal,
  onSaveClientMargin,
  isClientMarginSubmitting,
  selectedRFQForMargin,
  isRFQMarginModalOpen,
  onCloseRFQMarginModal,
  currentRFQMargin,
  onSaveRFQMargin,
  isRFQMarginSubmitting,
}) => {
  const { t } = useTranslation();
  const categories = ['office', 'itSupplies', 'breakroom', 'janitorial', 'maintenance'];

  return (
    <div data-testid="admin-margins-view" className="space-y-8 p-4 md:p-8 lg:p-12">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">tune</span>
          {t('admin.margins.configuration')}
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('admin.margins.universalMargin')}</label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={systemConfig.defaultMarginPercent}
                onChange={(e) => onGlobalMarginChange(Number(e.target.value))}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900"
              />
              <span className="text-slate-400 font-bold">%</span>
            </div>
          </div>
          <div className="lg:col-span-3 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const setting = marginSettings.find((m) => m.category === cat);
              const val = setting ? setting.marginPercent : systemConfig.defaultMarginPercent;
              return (
                <div key={cat} className="flex flex-col gap-1 p-3 rounded-xl border border-slate-200 bg-white">
                  <label className="text-xs font-bold text-slate-500 uppercase">{t(`categories.${cat}.label`, cat)}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={val}
                      onChange={(e) => onCategoryMarginChange(cat, Number(e.target.value))}
                      className="w-full bg-transparent font-bold text-lg text-slate-800 outline-none border-b border-dashed border-slate-300 focus:border-blue-500"
                    />
                    <span className="text-sm font-bold text-slate-400">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">manage_accounts</span>
            {t('admin.margins.manageClientMargins') || 'Manage Client Margins'}
          </h3>
          <div className="max-w-xl">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              {t('admin.margins.searchClient') || 'Search for a client to set personalized margin'}
            </label>
            <div className="relative">
              <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                <span className="material-symbols-outlined text-slate-400 pl-3">search</span>
                <input
                  type="text"
                  value={marginClientSearchTerm}
                  onChange={(e) => onMarginClientSearchTermChange(e.target.value)}
                  placeholder={t('admin.users.searchClients') || 'Search clients...'}
                  className="w-full p-2.5 outline-none text-slate-900 placeholder:text-slate-400"
                />
              </div>
              {marginClientSearchTerm.trim().length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                  {users
                    .filter((u) => u.role === 'CLIENT' &&
                      (u.name.toLowerCase().includes(marginClientSearchTerm.toLowerCase()) ||
                        u.companyName?.toLowerCase().includes(marginClientSearchTerm.toLowerCase()) ||
                        u.email.toLowerCase().includes(marginClientSearchTerm.toLowerCase()))
                    )
                    .slice(0, 5)
                    .map((client) => (
                      <button
                        key={client.id}
                        onClick={() => {
                          onOpenClientMarginModal(client);
                          onMarginClientSearchTermChange('');
                        }}
                        className="w-full text-left p-3 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0"
                      >
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{client.companyName || client.name}</p>
                          <p className="text-xs text-slate-500">{client.email}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${client.clientMargin !== undefined ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                            {client.clientMargin !== undefined ? `${client.clientMargin}%` : 'Default'}
                          </span>
                        </div>
                      </button>
                    ))
                  }
                  {users.filter((u) => u.role === 'CLIENT' &&
                    (u.name.toLowerCase().includes(marginClientSearchTerm.toLowerCase()) ||
                      u.companyName?.toLowerCase().includes(marginClientSearchTerm.toLowerCase()) ||
                      u.email.toLowerCase().includes(marginClientSearchTerm.toLowerCase()))
                  ).length === 0 && (
                    <div className="p-4 text-center text-slate-500 text-sm">
                      No clients found matching "{marginClientSearchTerm}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-600">domain</span>
              {t('admin.margins.analytics.clientMargin') || 'Margin by Client'}
            </h3>
            <div className="relative">
              <input
                type="text"
                value={clientWidgetSearch}
                onChange={(e) => onClientWidgetSearchChange(e.target.value)}
                placeholder="Search clients..."
                className="text-xs border border-slate-200 rounded-lg py-1 px-2 pl-7 w-32 focus:w-48 transition-all outline-none focus:border-purple-300"
              />
              <span className="material-symbols-outlined absolute left-1.5 top-1.5 text-[14px] text-slate-400">search</span>
            </div>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            {users
              .filter((u) => u.role === 'CLIENT' &&
                (!clientWidgetSearch ||
                  u.name.toLowerCase().includes(clientWidgetSearch.toLowerCase()) ||
                  u.companyName?.toLowerCase().includes(clientWidgetSearch.toLowerCase())
                )
              )
              .map((client) => (
                <div key={client.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-purple-200 transition-colors group">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{client.companyName || client.name}</p>
                    <p className="text-xs text-slate-500">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${client.clientMargin !== undefined ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>
                      {client.clientMargin !== undefined ? `${client.clientMargin}%` : 'Default'}
                    </span>
                    <button
                      onClick={() => onOpenClientMarginModal(client)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-purple-600 hover:border-purple-200 transition-all opacity-0 group-hover:opacity-100"
                      title="Set Margin"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  </div>
                </div>
              ))}
            {users.filter((u) => u.role === 'CLIENT').length === 0 && (
              <p className="text-slate-400 text-sm italic py-4 text-center">No clients found.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">request_quote</span>
              {t('admin.margins.analytics.rfqMargin') || 'Margin by RFQ'}
            </h3>
            <div className="relative">
              <input
                type="text"
                value={rfqWidgetSearch}
                onChange={(e) => onRfqWidgetSearchChange(e.target.value)}
                placeholder="Search RFQs..."
                className="text-xs border border-slate-200 rounded-lg py-1 px-2 pl-7 w-32 focus:w-48 transition-all outline-none focus:border-blue-300"
              />
              <span className="material-symbols-outlined absolute left-1.5 top-1.5 text-[14px] text-slate-400">search</span>
            </div>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            {rfqs
              .filter((r) => {
                const firstItem = r.items && r.items.length > 0 ? r.items[0] : null;
                const productName = firstItem
                  ? (products.find((p) => p.id === firstItem.productId)?.name || '')
                  : '';

                return !rfqWidgetSearch ||
                  r.id.toLowerCase().includes(rfqWidgetSearch.toLowerCase()) ||
                  productName.toLowerCase().includes(rfqWidgetSearch.toLowerCase());
              })
              .map((rfq) => {
                const currentConfiguredMargin = systemConfig.defaultMarginPercent;
                const firstItem = rfq.items && rfq.items.length > 0 ? rfq.items[0] : null;
                const productName = firstItem
                  ? (products.find((p) => p.id === firstItem.productId)?.name || 'Unknown Product')
                  : (t('admin.rfq.customRequest') || 'Custom Request');

                return (
                  <div key={rfq.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors group">
                    <div>
                      <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        #{rfq.id.toUpperCase().slice(0, 6)}...
                        <span className={`text-[10px] px-1.5 rounded border ${rfq.status === 'OPEN' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>{rfq.status}</span>
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-[150px]">{productName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onOpenRFQMarginModal(rfq.id, currentConfiguredMargin)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all opacity-0 group-hover:opacity-100"
                        title="Set Margin"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            {rfqs.length === 0 && <p className="text-slate-400 text-sm italic py-4 text-center">No RFQs found.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('admin.margins.quoteManager')}</h2>
          <p className="text-slate-500 mt-1">{t('admin.margins.quoteManagerDesc')}</p>
        </div>
      </div>

      <div className="space-y-6">
        {quotes.map((quote) => {
          const { value: currentMargin, type } = getEffectiveMarginData(quote, getQuoteCategory(quote));
          const calculatedPrice = quote.supplierPrice * (1 + currentMargin / 100);
          const profit = calculatedPrice - quote.supplierPrice;
          const category = getQuoteCategory(quote);

          return (
            <div key={quote.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-lg transition-all ${type === 'manual' ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'}`}>
              <div className="border-b border-slate-100 bg-slate-50/50 px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-slate-900">{t('admin.margins.quote')} #{quote.id}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-sm text-slate-500">{t('admin.margins.refRfq')} #{quote.rfqId.toUpperCase()}</span>
                  <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-600 text-xs font-bold">{category}</span>
                </div>
                <div className="flex gap-2">
                  <StatusBadge
                    status={quote.status === 'ACCEPTED' ? 'accepted' :
                      quote.status === 'REJECTED' ? 'rejected' :
                        quote.status === 'PENDING_ADMIN' ? 'pending' :
                          'pending'}
                    size="sm"
                  />
                </div>
              </div>

              <div className="p-4 md:p-8 grid lg:grid-cols-3 gap-4 md:gap-8 items-center">
                <div className="space-y-4 lg:border-r lg:border-slate-100 lg:pr-8">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs">S</div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">{t('admin.margins.fromSupplier')}</p>
                        <p className="text-sm font-bold text-slate-900">{t('admin.margins.sampleSupplier')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-300">arrow_downward</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">C</div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">{t('admin.margins.toClient')}</p>
                        <p className="text-sm font-bold text-slate-900">{t('admin.margins.sampleClient')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 flex flex-col md:flex-row items-center gap-6 justify-between">
                  <div className="text-center p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('admin.margins.costPrice')}</p>
                    <p className="text-2xl font-mono font-bold text-slate-700">${quote.supplierPrice.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('admin.margins.lead')}: {quote.leadTime}</p>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <button
                        onClick={() => onManualMarginChange(quote.id, Math.max(0, currentMargin - 1))}
                        className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:text-blue-600"
                      >-</button>
                      <div className="text-center w-24">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('admin.margins.margin')}</p>
                        <p className={`text-xl font-bold ${type === 'manual' ? 'text-blue-600' : 'text-slate-700'}`}>{currentMargin}%</p>
                      </div>
                      <button
                        onClick={() => onManualMarginChange(quote.id, currentMargin + 1)}
                        className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:text-blue-600"
                      >+</button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${type === 'manual' ? 'bg-blue-100 text-blue-700' :
                        type === 'category' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                        {type === 'manual' ? t('admin.margins.sourceManual') :
                          type === 'category' ? t('admin.margins.sourceCategory') :
                            t('admin.margins.sourceGlobal')}
                      </span>
                      {type === 'manual' && (
                        <button
                          onClick={() => onResetQuoteMargin(quote.id)}
                          className="text-[10px] text-slate-400 hover:text-red-500 underline"
                          title={t('admin.margins.resetToDefault')}
                        >
                          {t('admin.margins.reset')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-center bg-emerald-50 p-6 rounded-2xl border border-emerald-100 min-w-[180px]">
                    <p className="text-xs font-bold text-emerald-600/70 uppercase mb-2">{t('admin.margins.finalClientPrice')}</p>
                    <p className="text-3xl font-mono font-bold text-emerald-700">${calculatedPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p className="text-xs font-bold text-emerald-600 mt-2">+ ${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('admin.margins.profit')}</p>
                  </div>

                  <button
                    onClick={() => onSendQuoteToClient(quote.id)}
                    className="w-12 h-12 bg-slate-900 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {clientMarginClient && (
        <ClientMarginModal
          isOpen={isClientMarginModalOpen}
          onClose={onCloseClientMarginModal}
          client={clientMarginClient}
          onSave={onSaveClientMargin}
          isLoading={isClientMarginSubmitting}
        />
      )}

      {selectedRFQForMargin && (
        <RFQMarginModal
          isOpen={isRFQMarginModalOpen}
          onClose={onCloseRFQMarginModal}
          rfq={selectedRFQForMargin}
          currentMargin={currentRFQMargin}
          onSave={onSaveRFQMargin}
          isLoading={isRFQMarginSubmitting}
        />
      )}
    </div>
  );
};
