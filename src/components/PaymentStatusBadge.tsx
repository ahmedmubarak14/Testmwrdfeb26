import React from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentStatus } from '../types/types';

interface PaymentStatusBadgeProps {
  status: PaymentStatus | string;
  className?: string;
}

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status, className = '' }) => {
  const { t } = useTranslation();

  const normalizedStatus = typeof status === 'string' ? status.toUpperCase() : status;

  const statusConfig: Record<string, { bg: string; text: string; icon: string; label: string }> = {
    [PaymentStatus.PENDING]: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      icon: 'schedule',
      label: t('payment.bankTransfer.paymentPending')
    },
    [PaymentStatus.AWAITING_CONFIRMATION]: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: 'hourglass_top',
      label: t('payment.bankTransfer.awaitingConfirmation')
    },
    [PaymentStatus.CONFIRMED]: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: 'check_circle',
      label: t('payment.bankTransfer.paymentConfirmed')
    },
    [PaymentStatus.REJECTED]: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: 'cancel',
      label: t('common.rejected')
    }
  };

  const config = statusConfig[normalizedStatus] || statusConfig[PaymentStatus.PENDING];

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      <span className="material-symbols-outlined text-sm">{config.icon}</span>
      {config.label}
    </span>
  );
};
