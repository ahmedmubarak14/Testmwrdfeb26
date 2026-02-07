import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { paymentService } from '../services/paymentService';
import moyasarService from '../services/moyasarService';
import { LoadingSpinner } from './ui/LoadingSpinner';
import type { Payment, Invoice } from '../types/payment';
import { PaymentStatus } from '../types/payment';

interface PaymentHistoryProps {
  clientId: string;
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({ clientId }) => {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'payments' | 'invoices'>('payments');

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [paymentsData, invoicesData] = await Promise.all([
        paymentService.getPaymentsByClientId(clientId),
        paymentService.getInvoicesByClientId(clientId),
      ]);
      setPayments(paymentsData);
      setInvoices(invoicesData);
    } catch (error) {
      logger.error('Error loading payment data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: PaymentStatus | string) => {
    const colors: Record<string, string> = {
      [PaymentStatus.PAID]: 'bg-green-100 text-green-800',
      [PaymentStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
      [PaymentStatus.FAILED]: 'bg-red-100 text-red-800',
      [PaymentStatus.REFUNDED]: 'bg-purple-100 text-purple-800',
      [PaymentStatus.CANCELLED]: 'bg-gray-100 text-gray-800',
      'DRAFT': 'bg-gray-100 text-gray-800',
      'SENT': 'bg-blue-100 text-blue-800',
      'OVERDUE': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-green-600 text-2xl">payments</span>
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('paymentHistory.totalPaid')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {payments
                  .filter(p => p.status === PaymentStatus.PAID)
                  .reduce((sum, p) => sum + p.amount, 0)
                  .toFixed(2)}{' '}
                SAR
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-yellow-600 text-2xl">pending</span>
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('paymentHistory.pending')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {payments.filter(p => p.status === PaymentStatus.PENDING).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 text-2xl">description</span>
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('paymentHistory.invoices')}</p>
              <p className="text-2xl font-bold text-gray-900">{invoices.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex gap-8 px-6">
            <button
              onClick={() => setActiveTab('payments')}
              className={`py-4 border-b-2 font-medium transition-colors ${
                activeTab === 'payments'
                  ? 'border-[#0A2540] text-[#0A2540]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('paymentHistory.payments')} ({payments.length})
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`py-4 border-b-2 font-medium transition-colors ${
                activeTab === 'invoices'
                  ? 'border-[#0A2540] text-[#0A2540]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('paymentHistory.invoices')} ({invoices.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'payments' ? (
            <div className="space-y-4">
              {payments.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-gray-400 text-6xl">payments</span>
                  <p className="mt-4 text-gray-600">{t('paymentHistory.noPayments')}</p>
                </div>
              ) : (
                payments.map(payment => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-10 bg-[#0A2540] rounded-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-xl">credit_card</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {moyasarService.getPaymentMethodText(payment.payment_method)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {payment.card_last_four && `•••• ${payment.card_last_four}`}
                          {payment.card_brand && ` • ${payment.card_brand}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(payment.created_at).toLocaleDateString()} at{' '}
                          {new Date(payment.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{payment.amount.toFixed(2)} {payment.currency}</p>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            payment.status
                          )}`}
                        >
                          {moyasarService.getPaymentStatusText(payment.status)}
                        </span>
                      </div>
                      {payment.moyasar_transaction_url && (
                        <a
                          href={payment.moyasar_transaction_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0A2540] hover:text-[#0A2540]/80"
                        >
                          <span className="material-symbols-outlined">open_in_new</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-gray-400 text-6xl">description</span>
                  <p className="mt-4 text-gray-600">{t('paymentHistory.noInvoices')}</p>
                </div>
              ) : (
                invoices.map(invoice => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-xl">description</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                        <p className="text-sm text-gray-600">
                          {t('paymentHistory.issued')}: {new Date(invoice.issue_date).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-600">
                          {t('paymentHistory.due')}: {new Date(invoice.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{invoice.total_amount.toFixed(2)} SAR</p>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            invoice.status
                          )}`}
                        >
                          {invoice.status}
                        </span>
                      </div>
                      {invoice.pdf_url && (
                        <a
                          href={invoice.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors text-sm"
                        >
                          {t('paymentHistory.download')}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
