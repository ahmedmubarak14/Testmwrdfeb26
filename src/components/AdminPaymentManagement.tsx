import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, PaymentStatus } from '../types/types';

interface AdminPaymentManagementProps {
  orders: Order[];
  onConfirmPayment: (orderId: string, notes?: string) => void;
  onRejectPayment: (orderId: string, reason: string) => void;
}

export const AdminPaymentManagement: React.FC<AdminPaymentManagementProps> = ({
  orders,
  onConfirmPayment,
  onRejectPayment
}) => {
  const { t } = useTranslation();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const pendingPayments = orders.filter(o => 
    o.paymentStatus === PaymentStatus.AWAITING_CONFIRMATION
  );

  const confirmedPayments = orders.filter(o => 
    o.paymentStatus === PaymentStatus.CONFIRMED
  );

  const handleConfirm = (order: Order) => {
    onConfirmPayment(order.id, confirmNotes);
    setSelectedOrder(null);
    setConfirmNotes('');
  };

  const handleReject = () => {
    if (selectedOrder && rejectReason) {
      onRejectPayment(selectedOrder.id, rejectReason);
      setSelectedOrder(null);
      setRejectReason('');
      setShowRejectModal(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.payments.title')}</h1>
          <p className="text-gray-500 mt-1">{t('admin.payments.subtitle')}</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
          {t('admin.payments.pendingPayments')} ({pendingPayments.length})
        </h2>
        
        {pendingPayments.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">payments</span>
            <p className="text-gray-500">{t('admin.payments.noPendingPayments')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('admin.overview.orderId')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('admin.payments.paymentReference')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('common.amount')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('admin.payments.paymentDate')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingPayments.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{order.id}</td>
                    <td className="px-6 py-4 font-mono text-sm text-gray-600">{order.paymentReference || '-'}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">${order.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td className="px-6 py-4 text-gray-500">{order.paymentSubmittedAt || order.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirm(order)}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">check</span>
                          {t('admin.payments.confirmPayment')}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowRejectModal(true);
                          }}
                          className="px-3 py-1.5 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                          {t('common.reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          {t('admin.payments.confirmedPayments')} ({confirmedPayments.length})
        </h2>
        
        {confirmedPayments.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <p className="text-gray-500">{t('admin.payments.noConfirmedPayments')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('admin.overview.orderId')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('admin.payments.paymentReference')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('common.amount')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('admin.payments.confirmedAt')}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {confirmedPayments.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{order.id}</td>
                    <td className="px-6 py-4 font-mono text-sm text-gray-600">{order.paymentReference || '-'}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">${order.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td className="px-6 py-4 text-gray-500">{order.paymentConfirmedAt || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        {t('payment.bankTransfer.paymentConfirmed')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRejectModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('admin.payments.rejectPayment')}</h3>
            <p className="text-gray-600 mb-4">
              {t('admin.payments.rejectPaymentDesc')} {selectedOrder.id}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('admin.payments.rejectionReason')}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedOrder(null);
                  setRejectReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {t('admin.payments.rejectPayment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
