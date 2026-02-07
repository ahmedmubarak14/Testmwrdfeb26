import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../utils/logger';

interface CustomRequestRow {
  id: string;
  created_at: string;
  item_name: string;
  description: string;
  status: string;
  client?: {
    name?: string;
    company_name?: string;
  } | null;
}

export const AdminCustomRequestsView: React.FC = () => {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<CustomRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const { data } = await supabase
          .from('custom_item_requests')
          .select('*, client:client_id(name, company_name)')
          .order('created_at', { ascending: false });

        if (data) {
          setRequests(data as CustomRequestRow[]);
        }
      } catch (err) {
        logger.error('Failed to fetch custom item requests', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">{t('sidebar.customRequests') || 'Custom Item Requests'}</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.date')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.item')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.client')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.details')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {requests.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    {t('admin.customRequests.noRequestsFound')}
                  </td>
                </tr>
              )}
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{req.item_name}</td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="flex flex-col">
                      <span className="font-medium">{req.client?.company_name || t('admin.customRequests.unknownCompany')}</span>
                      <span className="text-xs">{req.client?.name || t('admin.customRequests.unknownUser')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate text-gray-500">
                    {req.description}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium uppercase bg-slate-100 text-slate-700">
                      {req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
