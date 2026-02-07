import React from 'react';
import { useTranslation } from 'react-i18next';
import { getAllowedOrderStatusTransitions } from '../../../services/orderStatusService';
import { Order } from '../../../types/types';

interface OrdersTableProps {
  filterStatus: string;
  filteredOrders: Order[];
  filterStatusOptions: string[];
  statusSelectOptions: string[];
  statusLabel: (status: string) => string;
  onFilterStatusChange: (value: string) => void;
  onExport: () => void;
  onStatusChange: (id: string, status: string) => void;
  onOpenPaymentReview: (order: Order) => void;
  onCopyPaymentLink: (link: string) => void;
  onOpenPaymentLink: (order: Order) => void;
  onOpenOrderDetails: (order: Order) => void;
  enableExternalPaymentLinks: boolean;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  filterStatus,
  filteredOrders,
  filterStatusOptions,
  statusSelectOptions,
  statusLabel,
  onFilterStatusChange,
  onExport,
  onStatusChange,
  onOpenPaymentReview,
  onCopyPaymentLink,
  onOpenPaymentLink,
  onOpenOrderDetails,
  enableExternalPaymentLinks,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">{t('sidebar.orders') || 'Order Management'}</h2>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => onFilterStatusChange(e.target.value)}
            data-testid="admin-orders-status-filter"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">{t('admin.orders.allStatuses')}</option>
            {filterStatusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            {t('admin.orders.export')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.orders.orderId')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.orders.date')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.orders.amount')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.orders.status')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500 text-right">{t('admin.orders.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    {t('admin.orders.noOrdersFound')}
                  </td>
                </tr>
              )}
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {order.id}
                    {order.system_po_number && <div className="text-xs text-gray-400">{t('admin.orders.po')}: {order.system_po_number}</div>}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{new Date(order.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-gray-900 font-mono">${order.amount.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {(() => {
                      const allowedTransitions = getAllowedOrderStatusTransitions(order.status);
                      const allowedSet = new Set<string>([order.status, ...allowedTransitions]);
                      const availableOptions = statusSelectOptions.filter((status) => allowedSet.has(status));

                      return (
                        <select
                          value={order.status}
                          onChange={(e) => onStatusChange(order.id, e.target.value)}
                          className={`border-none text-xs font-bold uppercase rounded-full px-3 py-1 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                            order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}
                        >
                          {availableOptions.map((status) => (
                            <option key={status} value={status}>
                              {statusLabel(status)}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {(order.status === 'PENDING_PAYMENT' || order.status === 'AWAITING_CONFIRMATION') && (
                        <button
                          onClick={() => onOpenPaymentReview(order)}
                          data-testid="admin-orders-review-payment-button"
                          className="text-emerald-700 hover:underline text-sm font-semibold"
                        >
                          {t('admin.orders.reviewPayment', 'Review Payment')}
                        </button>
                      )}
                      {enableExternalPaymentLinks && order.paymentLinkUrl ? (
                        <button
                          onClick={() => onCopyPaymentLink(order.paymentLinkUrl!)}
                          className="text-emerald-600 hover:underline text-sm font-medium"
                        >
                          {t('admin.orders.copyPaymentLink', 'Copy Payment Link')}
                        </button>
                      ) : null}
                      {enableExternalPaymentLinks && (
                        <button
                          onClick={() => onOpenPaymentLink(order)}
                          className="text-blue-600 hover:underline text-sm font-medium"
                        >
                          {order.paymentLinkUrl
                            ? t('admin.orders.editPaymentLink', 'Edit Payment Link')
                            : t('admin.orders.setPaymentLink', 'Set Payment Link')}
                        </button>
                      )}
                      <button
                        onClick={() => onOpenOrderDetails(order)}
                        data-testid="admin-orders-view-details-button"
                        className="text-blue-600 hover:underline text-sm font-medium"
                      >
                        {t('admin.orders.viewDetails')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

