import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { CreditLimitAdjustmentType, User } from '../../types/types';

interface CreditLimitAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: User | null;
  mode: CreditLimitAdjustmentType;
  onSubmit: (payload: { amount: number; reason: string }) => Promise<void>;
  isSubmitting?: boolean;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export const CreditLimitAdjustmentModal: React.FC<CreditLimitAdjustmentModalProps> = ({
  isOpen,
  onClose,
  client,
  mode,
  onSubmit,
  isSubmitting = false,
}) => {
  const { t } = useTranslation();
  const [amountInput, setAmountInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentLimit = Math.max(0, Number(client?.creditLimit || 0));

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'SET') {
      setAmountInput(String(Math.round(currentLimit * 100) / 100));
    } else {
      setAmountInput('');
    }
    setReasonInput('');
    setError(null);
  }, [isOpen, mode, currentLimit]);

  const parsedAmount = useMemo(() => {
    const normalized = amountInput.replace(/,/g, '').trim();
    if (!normalized) return NaN;
    return Number(normalized);
  }, [amountInput]);

  const projectedLimit = useMemo(() => {
    if (!Number.isFinite(parsedAmount)) return null;
    if (mode === 'SET') return parsedAmount;
    if (mode === 'INCREASE') return currentLimit + parsedAmount;
    return currentLimit - parsedAmount;
  }, [parsedAmount, mode, currentLimit]);

  const validate = () => {
    if (!Number.isFinite(parsedAmount)) {
      return t('admin.users.invalidAmount') || 'Enter a valid amount';
    }

    if (parsedAmount < 0) {
      return t('admin.users.invalidAmount') || 'Enter a valid amount';
    }

    if (mode !== 'SET' && parsedAmount === 0) {
      return mode === 'INCREASE'
        ? (t('admin.users.increaseMustBePositive') || 'Increase amount must be greater than zero')
        : (t('admin.users.decreaseMustBePositive') || 'Decrease amount must be greater than zero');
    }

    if (mode === 'DECREASE' && parsedAmount > currentLimit) {
      return t('admin.users.creditLimitCannotGoNegative') || 'Credit limit cannot go below zero';
    }

    if (reasonInput.trim().length < 5) {
      return t('admin.users.creditAdjustmentReasonRequired') || 'Please provide a reason (at least 5 characters).';
    }

    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    await onSubmit({
      amount: Math.round(parsedAmount * 100) / 100,
      reason: reasonInput.trim(),
    });
  };

  const modeLabel = mode === 'SET'
    ? (t('common.set') || 'Set')
    : mode === 'INCREASE'
      ? (t('admin.users.increaseCredit') || 'Increase')
      : (t('admin.users.decreaseCredit') || 'Decrease');

  const amountLabel = mode === 'SET'
    ? (t('admin.users.newCreditLimitAmount') || 'New credit limit amount (USD)')
    : mode === 'INCREASE'
      ? (t('admin.users.increaseByAmount') || 'Increase by amount (USD)')
      : (t('admin.users.decreaseByAmount') || 'Decrease by amount (USD)');

  const modalTitle = `${modeLabel} ${t('admin.users.creditLimit') || 'Credit Limit'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      {!client ? null : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{client.companyName || client.name}</p>
            <p className="text-xs text-slate-500">{client.email}</p>
            <p className="mt-2 text-sm text-slate-700">
              {t('admin.users.currentCreditLimit') || 'Current limit'}: <span className="font-semibold">{currencyFormatter.format(currentLimit)}</span>
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{amountLabel}</label>
            <input
              data-testid="credit-adjust-amount-input"
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={mode === 'SET' ? '50000' : '1000'}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('admin.users.adjustmentReason') || 'Reason for change'}
            </label>
            <textarea
              data-testid="credit-adjust-reason-input"
              value={reasonInput}
              onChange={(event) => setReasonInput(event.target.value)}
              rows={3}
              maxLength={300}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={t('admin.users.adjustmentReasonPlaceholder') || 'Example: Increased annual budget for Q2 procurement plan'}
            />
            <p className="mt-1 text-xs text-slate-500">{reasonInput.trim().length}/300</p>
          </div>

          {projectedLimit !== null && Number.isFinite(projectedLimit) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {t('admin.users.projectedCreditLimit') || 'Projected limit'}:{' '}
              <span className="font-semibold">
                {currencyFormatter.format(Math.max(0, Math.round(projectedLimit * 100) / 100))}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              data-testid="credit-adjust-cancel-button"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              data-testid="credit-adjust-save-button"
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
