import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { CreditLimitAdjustment } from '../../types/types';

interface CreditLimitHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  entries: CreditLimitAdjustment[];
  isLoading?: boolean;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const CreditLimitHistoryModal: React.FC<CreditLimitHistoryModalProps> = ({
  isOpen,
  onClose,
  clientName,
  entries,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('admin.users.creditLimitHistory') || 'Credit Limit History'} - ${clientName}`}
      size="lg"
    >
      {isLoading ? (
        <div className="py-10 text-center text-sm text-slate-500">{t('common.loading') || 'Loading...'}</div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          {t('admin.users.noCreditHistory') || 'No credit limit changes recorded yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{t('common.date') || 'Date'}</th>
                <th className="px-3 py-2">{t('admin.users.changeType') || 'Type'}</th>
                <th className="px-3 py-2">{t('admin.users.changeAmount') || 'Change'}</th>
                <th className="px-3 py-2">{t('admin.users.newCreditLimitAmount') || 'New limit'}</th>
                <th className="px-3 py-2">{t('admin.users.adjustmentReason') || 'Reason'}</th>
                <th className="px-3 py-2">{t('admin.users.changedBy') || 'Changed by'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isIncrease = entry.changeAmount > 0;
                const isDecrease = entry.changeAmount < 0;
                return (
                  <tr key={entry.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-3 text-slate-600">{dateFormatter.format(new Date(entry.createdAt))}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {entry.adjustmentType}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      <span className={isIncrease ? 'text-emerald-700' : isDecrease ? 'text-amber-700' : 'text-slate-700'}>
                        {isIncrease ? '+' : ''}{currencyFormatter.format(entry.changeAmount)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{currencyFormatter.format(entry.newLimit)}</td>
                    <td className="px-3 py-3 text-slate-700">{entry.reason}</td>
                    <td className="px-3 py-3 text-slate-600">{entry.adminName || entry.adminId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {t('common.close') || 'Close'}
        </button>
      </div>
    </Modal>
  );
};
