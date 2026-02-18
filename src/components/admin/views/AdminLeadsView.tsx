import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { leadsService, Lead } from '../../../services/leadsService';
import { useToast } from '../../../hooks/useToast';
import { StatusBadge } from '../../ui/StatusBadge';
import { logger } from '../../../utils/logger';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

export const AdminLeadsView: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLeads = async () => {
    try {
      const data = await leadsService.getLeads();
      setLeads(data);
    } catch (error) {
      logger.error('Failed to load leads', error);
      toast.error(t('admin.leads.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleStatusChange = async (id: string, status: NonNullable<Lead['status']>) => {
    await leadsService.updateLeadStatus(id, status);
    loadLeads();
    toast.success(t('admin.leads.statusUpdated'));
  };

  return (
    <div data-testid="admin-leads-view">
      <PortalPageShell className="animate-in fade-in duration-300">
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.leads') || 'Leads & Signups'}
          subtitle={t('admin.leads.subtitle')}
          actions={(
            <button
              onClick={loadLeads}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              aria-label={t('common.refresh')}
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
          )}
        />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.date')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.name')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.company')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.contact')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.type')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.status')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {leads.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    {t('admin.leads.noLeadsFound')}
                  </td>
                </tr>
              )}
              {leads.map((lead) => (
                <tr key={lead.id || `${lead.email}-${lead.created_at}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{lead.name}</td>
                  <td className="px-6 py-4 text-gray-600">{lead.company_name}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-xs text-gray-500">
                      <span>{lead.email}</span>
                      <span>{lead.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium uppercase ${lead.account_type === 'supplier' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                      {lead.account_type === 'supplier'
                        ? t('admin.leads.typeSupplier')
                        : t('admin.leads.typeClient')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={lead.status.toLowerCase()} size="sm" />
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={lead.status || 'PENDING'}
                      onChange={(e) => {
                        if (!lead.id) return;
                        handleStatusChange(lead.id, e.target.value as NonNullable<Lead['status']>);
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="PENDING">{t('admin.leads.pending')}</option>
                      <option value="CONTACTED">{t('admin.leads.contacted')}</option>
                      <option value="CONVERTED">{t('admin.leads.converted')}</option>
                      <option value="REJECTED">{t('admin.leads.rejected')}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </PortalPageShell>
    </div>
  );
};
