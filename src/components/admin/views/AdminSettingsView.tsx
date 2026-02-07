import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../hooks/useToast';

export const AdminSettingsView: React.FC = () => {
  const { t } = useTranslation();
  const { systemConfig, updateSystemConfig } = useStore();
  const [localConfig, setLocalConfig] = useState(systemConfig);
  const toast = useToast();

  useEffect(() => {
    setLocalConfig(systemConfig);
  }, [systemConfig]);

  const handleSave = () => {
    updateSystemConfig(localConfig);
    toast.success(t('admin.settings.saved', 'Settings Saved'));
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('admin.settings.title', 'Platform Settings')}</h2>
          <p className="text-gray-500 mt-1">{t('admin.settings.subtitle', 'Configure system-wide parameters and automation rules')}</p>
        </div>
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-blue-500/20"
        >
          {t('common.saveChanges', 'Save Changes')}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <span className="material-symbols-outlined text-2xl">bolt</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('admin.settings.autoQuote', 'Auto-Quote System')}</h3>
              <p className="text-sm text-gray-400">{t('admin.settings.autoQuoteDesc', 'Automated pricing for expired RFQs')}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {t('admin.settings.timerDelay', 'Auto-Quote Delay (Minutes)')}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="1"
                  value={localConfig.autoQuoteDelayMinutes}
                  onChange={(e) => setLocalConfig({ ...localConfig, autoQuoteDelayMinutes: Number(e.target.value) })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-gray-400 font-medium">{t('admin.settings.min', 'min')}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {t('admin.settings.autoQuoteHelp', 'RFQs will be automatically quoted if no suppliers respond within this time.')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {t('admin.settings.defaultMargin', 'Default Automation Margin')}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localConfig.defaultMarginPercent}
                  onChange={(e) => setLocalConfig({ ...localConfig, defaultMarginPercent: Number(e.target.value) })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-gray-400 font-medium">{t('admin.settings.percent', '%')}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {t('admin.settings.marginHelp', "Margin applied to the supplier's selling price for auto-generated quotes.")}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm opacity-60">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <span className="material-symbols-outlined text-2xl">notifications</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('admin.settings.notifications', 'Notification Rules')}</h3>
              <p className="text-sm text-gray-400">{t('common.comingSoon')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
