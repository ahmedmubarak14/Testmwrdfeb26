import { logger } from '@/src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { transactionsService, Transaction } from '../../services/transactionsService';
import { formatCurrency } from '../../utils/currency';
import { useToast } from '../../hooks/useToast';

const exportTransactionsToCsv = (rows: Transaction[]) => {
    if (!rows.length) return;

    const csv = [
        ['date', 'description', 'type', 'amount', 'reference'].join(','),
        ...rows.map((row) =>
            [
                JSON.stringify(new Date(row.created_at).toISOString()),
                JSON.stringify(row.description || row.type),
                JSON.stringify(row.type),
                JSON.stringify(row.amount),
                JSON.stringify(row.reference_id || ''),
            ].join(',')
        ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'client_transactions.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const ClientFinancials = () => {
    const { t } = useTranslation();
    const toast = useToast();
    const { currentUser } = useStore();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        creditLimit: 0,
        balance: 0,
        available: 0
    });

    useEffect(() => {
        if (currentUser) {
            loadFinancials();
        }
    }, [currentUser]);

    const loadFinancials = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const fallbackCreditLimit = Number(currentUser.creditLimit ?? 0);
            const fallbackCreditUsed = Math.max(Number(currentUser.creditUsed ?? 0), 0);

            const balanceData = await transactionsService.getBalance(currentUser.id).catch(() => ({
                creditLimit: fallbackCreditLimit,
                balance: -fallbackCreditUsed
            }));

            const txs = await transactionsService.getMyTransactions(currentUser.id).catch(() => []);
            const limit = Math.max(Number(balanceData.creditLimit ?? fallbackCreditLimit), 0);
            const rawBalance = Number(balanceData.balance ?? 0);
            const usedFromBalance = rawBalance < 0 ? Math.abs(rawBalance) : 0;
            const used = Math.max(
                Number.isFinite(currentUser.creditUsed) ? Number(currentUser.creditUsed) : usedFromBalance,
                0
            );

            setStats({
                creditLimit: limit,
                balance: used,
                available: Math.max(limit - used, 0)
            });
            setTransactions(txs);
        } catch (error) {
            logger.error('Error loading financials:', error);
        } finally {
            setLoading(false);
        }
    };

    const latestPayment = transactions.find((tx) => tx.type === 'PAYMENT');
    const utilizationPercent = stats.creditLimit > 0
        ? Math.round((stats.balance / stats.creditLimit) * 100)
        : 0;
    const utilizationWidth = stats.creditLimit > 0
        ? Math.min((stats.balance / stats.creditLimit) * 100, 100)
        : 0;

    return (
        <div className="p-4 md:p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300 transition-all">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-800">{t('sidebar.financials') || 'Financial Overview'}</h1>
                    <p className="text-neutral-500">{t('client.financials.subtitle')}</p>
                </div>
                <button
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium shadow-sm transition-all hover:scale-105 active:scale-95"
                    onClick={() => toast.success(t('client.financials.requestSubmitted') || 'Credit increase request sent to admin')}
                >
                    <span className="material-symbols-outlined">add_card</span>
                    {t('client.financials.requestCreditIncrease')}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="material-symbols-outlined text-9xl">account_balance</span>
                    </div>
                    <p className="text-blue-100 font-medium mb-1">{t('client.financials.availableCredit')}</p>
                    <h2 className="text-4xl font-bold tracking-tight">{formatCurrency(stats.available)}</h2>
                    <div className="mt-4 flex gap-2 text-sm text-blue-100 bg-white/10 w-fit px-3 py-1 rounded-full backdrop-blur-sm">
                        <span className="material-symbols-outlined text-sm">verified_user</span>
                        <span>{t('client.financials.approvedLimit')}: {formatCurrency(stats.creditLimit)}</span>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-neutral-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
                    <div className="absolute bottom-4 right-4 w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-orange-600">pie_chart</span>
                    </div>
                    <p className="text-neutral-500 font-medium mb-1">{t('client.financials.creditUsed')}</p>
                    <h2 className="text-3xl font-bold text-neutral-800">{formatCurrency(stats.balance)}</h2>
                    <div className="w-full bg-neutral-100 h-2 mt-4 rounded-full overflow-hidden">
                        <div
                            className="bg-orange-500 h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${utilizationWidth}%` }}
                        />
                    </div>
                    <p className="text-xs text-neutral-400 mt-2">
                        {utilizationPercent}% {t('client.financials.utilization')}
                    </p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-neutral-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
                    <div className="absolute bottom-4 right-4 w-12 h-12 bg-green-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-green-600">payments</span>
                    </div>
                    <p className="text-neutral-500 font-medium mb-1">{t('client.financials.lastPayment')}</p>
                    <h2 className="text-3xl font-bold text-neutral-800">{latestPayment ? formatCurrency(latestPayment.amount) : '--'}</h2>
                    <p className="text-sm text-neutral-400 mt-1">
                        {latestPayment ? new Date(latestPayment.created_at).toLocaleDateString() : t('client.financials.noRecentPayments')}
                    </p>
                    <button
                        onClick={() => toast.info(t('client.financials.redirectToPayments') || 'Payment flow will open here')}
                        className="mt-4 text-sm font-bold text-blue-600 hover:underline"
                    >
                        {t('client.financials.makePayment')}
                    </button>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
                    <h3 className="font-bold text-lg text-neutral-800">{t('client.financials.transactionHistory')}</h3>
                    <button
                        onClick={() => {
                            exportTransactionsToCsv(transactions);
                            toast.success(t('client.financials.statementExported') || 'Statement exported');
                        }}
                        className="text-blue-600 text-sm font-bold hover:underline flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-base">file_download</span>
                        {t('client.financials.exportStatement')}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white border-b border-neutral-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.financials.date')}</th>
                                <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.financials.description')}</th>
                                <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.financials.type')}</th>
                                <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase text-right">{t('client.financials.amount')}</th>
                                <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase text-center">{t('client.financials.reference')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">{t('client.financials.loading')}</td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-3">
                                                <span className="material-symbols-outlined text-neutral-300 text-3xl">receipt_long</span>
                                            </div>
                                            <p className="text-neutral-500 font-medium">{t('client.financials.noTransactions')}</p>
                                            <p className="text-neutral-400 text-sm">{t('client.financials.activityHere')}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-neutral-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-neutral-600">
                                            {new Date(tx.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-neutral-800">
                                            {tx.description || tx.type}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tx.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                                                tx.type === 'REFUND' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-orange-100 text-orange-800'
                                                }`}>
                                                {t(`client.financials.types.${tx.type.toLowerCase()}`, tx.type.replace('_', ' '))}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-mono font-bold ${tx.type === 'PAYMENT' || tx.type === 'REFUND' ? 'text-green-600' : 'text-neutral-800'
                                            }`}>
                                            {tx.type === 'PAYMENT' || tx.type === 'REFUND' ? '+' : '-'} {formatCurrency(tx.amount)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-xs font-mono text-neutral-400">
                                            {tx.reference_id || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
