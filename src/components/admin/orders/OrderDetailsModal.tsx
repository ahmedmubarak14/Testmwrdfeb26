import React from 'react';
import { useTranslation } from 'react-i18next';
import { Order, PaymentAuditLog } from '../../../types/types';

interface OrderDetailsModalProps {
  order: Order | null;
  paymentAuditLogs: PaymentAuditLog[];
  isLoadingOrderAuditLogs: boolean;
  enableExternalPaymentLinks: boolean;
  paymentAuditActionLabel: (action: string) => string;
  onClose: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  order,
  paymentAuditLogs,
  isLoadingOrderAuditLogs,
  enableExternalPaymentLinks,
  paymentAuditActionLabel,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!order) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.orders.viewDetails')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
          <p><span className="font-semibold">{t('admin.orders.orderId')}:</span> {order.id}</p>
          <p><span className="font-semibold">{t('admin.orders.date')}:</span> {new Date(order.date).toLocaleString()}</p>
          <p><span className="font-semibold">{t('admin.orders.amount')}:</span> ${order.amount.toLocaleString()}</p>
          <p><span className="font-semibold">{t('admin.orders.status')}:</span> {order.status}</p>
          {order.paymentReference && (
            <p><span className="font-semibold">{t('admin.orders.paymentReference', 'Payment Reference')}:</span> {order.paymentReference}</p>
          )}
          {order.paymentSubmittedAt && (
            <p><span className="font-semibold">{t('admin.orders.paymentSubmittedAt', 'Submitted At')}:</span> {new Date(order.paymentSubmittedAt).toLocaleString()}</p>
          )}
          {order.system_po_number && (
            <p><span className="font-semibold">{t('admin.orders.po', 'PO')}:</span> {order.system_po_number}</p>
          )}
          {enableExternalPaymentLinks && order.paymentLinkUrl && (
            <a
              href={order.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              {t('admin.orders.openPaymentLink', 'Open payment link')}
            </a>
          )}

          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="font-semibold mb-2">{t('admin.orders.auditHistory', 'Payment Audit History')}</p>
            {isLoadingOrderAuditLogs ? (
              <p className="text-xs text-gray-500">{t('common.loading', 'Loading...')}</p>
            ) : paymentAuditLogs.length === 0 ? (
              <p className="text-xs text-gray-500">{t('admin.orders.noAuditHistory', 'No payment audit events yet')}</p>
            ) : (
              <div className="space-y-2">
                {paymentAuditLogs.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-800">
                      {paymentAuditActionLabel(entry.action)}
                    </p>
                    <p className="text-xs text-gray-600">
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.actorRole ? ` • ${entry.actorRole}` : ''}
                    </p>
                    {(entry.fromStatus || entry.toStatus) && (
                      <p className="text-xs text-gray-600">
                        {entry.fromStatus || '—'} → {entry.toStatus || '—'}
                      </p>
                    )}
                    {entry.paymentReference && (
                      <p className="text-xs text-gray-700">
                        {t('admin.orders.paymentReference', 'Payment Reference')}: {entry.paymentReference}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-gray-700">{entry.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

