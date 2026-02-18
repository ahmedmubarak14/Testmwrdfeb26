import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { CustomItemRequest, CustomRequestStatus, RequestPriority } from '../../types/types';
import { getClientCustomRequests, cancelCustomRequest, getStatusColorClass, getPriorityColorClass } from '../../services/customItemRequestService';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../utils/logger';

interface ClientCustomRequestsListProps {
  onCreateNew: () => void;
}

export const ClientCustomRequestsList: React.FC<ClientCustomRequestsListProps> = ({ onCreateNew }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentUser } = useStore();
  const [requests, setRequests] = useState<CustomItemRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadRequests();
  }, [currentUser?.id]);

  const loadRequests = async () => {
    if (!currentUser?.id) return;
    try {
      setLoading(true);
      const data = await getClientCustomRequests(currentUser.id);
      setRequests(data);
    } catch (err) {
      logger.error('Failed to load custom requests', err);
      toast.error(t('customRequest.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    if (!currentUser?.id) return;
    try {
      setCancellingId(requestId);
      await cancelCustomRequest(requestId, currentUser.id);
      toast.success(t('customRequest.cancelled'));
      await loadRequests();
    } catch (err) {
      logger.error('Failed to cancel request', err);
      toast.error(t('customRequest.cancelError'));
    } finally {
      setCancellingId(null);
    }
  };

  const canCancel = (status: CustomRequestStatus) =>
    status === CustomRequestStatus.PENDING || status === CustomRequestStatus.UNDER_REVIEW;

  const getLocalizedStatusText = (status: CustomRequestStatus) => {
    const keyByStatus: Record<CustomRequestStatus, string> = {
      [CustomRequestStatus.PENDING]: 'customRequest.statusPending',
      [CustomRequestStatus.UNDER_REVIEW]: 'customRequest.statusUnderReview',
      [CustomRequestStatus.ASSIGNED]: 'customRequest.statusAssigned',
      [CustomRequestStatus.QUOTED]: 'customRequest.statusQuoted',
      [CustomRequestStatus.APPROVED]: 'customRequest.statusApproved',
      [CustomRequestStatus.REJECTED]: 'customRequest.statusRejected',
      [CustomRequestStatus.CANCELLED]: 'customRequest.statusCancelled',
    };

    return t(keyByStatus[status]);
  };

  const getLocalizedPriorityText = (priority: RequestPriority) => {
    const keyByPriority: Record<RequestPriority, string> = {
      [RequestPriority.LOW]: 'customRequest.priorityLow',
      [RequestPriority.MEDIUM]: 'customRequest.priorityMedium',
      [RequestPriority.HIGH]: 'customRequest.priorityHigh',
      [RequestPriority.URGENT]: 'customRequest.priorityUrgent',
    };

    return t(keyByPriority[priority]);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 lg:p-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {t('customRequest.myRequests')}
          </h2>
          <p className="text-slate-500 mt-1">
            {t('customRequest.myRequestsDesc')}
          </p>
        </div>
        <button
          onClick={onCreateNew}
          className="px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('customRequest.newRequest')}
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-gray-400">design_services</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {t('customRequest.noRequests')}
          </h3>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            {t('customRequest.noRequestsDesc')}
          </p>
          <button
            onClick={onCreateNew}
            className="mt-6 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('customRequest.createFirst')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div
                className="p-5 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-blue-600">design_services</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{req.itemName}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString()} &middot; {t('customRequest.qty')}: {req.quantity}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getPriorityColorClass(req.priority)}`}>
                    {getLocalizedPriorityText(req.priority)}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getStatusColorClass(req.status)}`}>
                    {getLocalizedStatusText(req.status)}
                  </span>
                  <span className="material-symbols-outlined text-gray-400">
                    {expandedId === req.id ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {expandedId === req.id && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.description')}</p>
                      <p className="text-sm text-gray-700">{req.description}</p>
                    </div>
                    {req.specifications && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.specifications')}</p>
                        <p className="text-sm text-gray-700">{req.specifications}</p>
                      </div>
                    )}
                    {req.targetPrice && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.targetPrice')}</p>
                        <p className="text-sm text-gray-700">{req.currency} {req.targetPrice}</p>
                      </div>
                    )}
                    {req.deadline && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.deadline')}</p>
                        <p className="text-sm text-gray-700">{new Date(req.deadline).toLocaleDateString()}</p>
                      </div>
                    )}
                    {req.rejectionReason && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-bold text-red-500 uppercase mb-1">{t('customRequest.rejectionReason')}</p>
                        <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{req.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                  {canCancel(req.status) && (
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(req.id);
                        }}
                        disabled={cancellingId === req.id}
                        className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {cancellingId === req.id
                          ? t('common.cancelling')
                          : t('customRequest.cancelRequest')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
