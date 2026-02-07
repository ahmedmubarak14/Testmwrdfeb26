import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { User, UserRole } from '../../types/types';
import { StatusBadge } from '../ui/StatusBadge';

interface UserActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    onUpdateStatus: (userId: string, status: any, kycStatus?: any) => Promise<void>;
}

export const UserActionModal: React.FC<UserActionModalProps> = ({
    isOpen,
    onClose,
    user,
    onUpdateStatus
}) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState<typeof user.status>(user.status);
    const [selectedKycStatus, setSelectedKycStatus] = useState<typeof user.kycStatus>(user.kycStatus || 'INCOMPLETE');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');

    // Re-sync state when user prop changes
    React.useEffect(() => {
        setSelectedStatus(user.status);
        setSelectedKycStatus(user.kycStatus || 'INCOMPLETE');
        setReason('');
        setNotes('');
    }, [user.id, user.status, user.kycStatus]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await onUpdateStatus(user.id, selectedStatus, selectedKycStatus);
            onClose();
        } catch (error) {
            logger.error(error);
        } finally {
            setLoading(false);
        }
    };

    const isSupplier = user.role === UserRole.SUPPLIER;
    const isClient = user.role === UserRole.CLIENT;

    // Status options based on user role
    const supplierStatusOptions = [
        { value: 'PENDING', label: 'Pending' },
        { value: 'APPROVED', label: 'Approved' },
        { value: 'ACTIVE', label: 'Active' },
        { value: 'REJECTED', label: 'Rejected' },
        { value: 'DEACTIVATED', label: 'Suspended' }
    ];

    const clientStatusOptions = [
        { value: 'PENDING', label: 'Pending' },
        { value: 'ACTIVE', label: 'Active' },
        { value: 'DEACTIVATED', label: 'Deactivated' }
    ];

    const kycStatusOptions = [
        { value: 'VERIFIED', label: 'Verified' },
        { value: 'IN_REVIEW', label: 'In Review' },
        { value: 'INCOMPLETE', label: 'Incomplete' },
        { value: 'REJECTED', label: 'Rejected' }
    ];

    const reasonOptions = [
        { value: 'kyc_verification_failed', label: t('admin.users.kycVerificationFailed') || 'KYC verification failed' },
        { value: 'suspicious_activity', label: t('admin.users.suspiciousActivity') || 'Suspicious activity' },
        { value: 'user_request', label: t('admin.users.userRequest') || 'User request' },
        { value: 'policy_violation', label: t('admin.users.policyViolation') || 'Policy violation' },
        { value: 'payment_issues', label: t('admin.users.paymentIssues') || 'Payment issues' },
        { value: 'other', label: t('admin.users.other') || 'Other' }
    ];

    const statusOptions = isSupplier ? supplierStatusOptions : clientStatusOptions;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('admin.users.manageUser') || 'Manage User'}>
            <div className="space-y-6 max-h-[80vh] overflow-y-auto">
                {/* User Details Section */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-800 dark:to-gray-900 p-6 rounded-xl border border-slate-200 dark:border-gray-700">
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
                            {(user.companyName || user.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-xl text-slate-900 dark:text-white mb-1">
                                {user.companyName || user.name}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{user.email}</p>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">{t('common.phone')}:</span>
                                    <p className="font-medium text-slate-700 dark:text-slate-300">{(user as any).phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">{t('admin.users.registeredOn')}:</span>
                                    <p className="font-medium text-slate-700 dark:text-slate-300">
                                        {user.dateJoined ? new Date(user.dateJoined).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">{t('common.status')}:</span>
                                    <div className="mt-1">
                                        <StatusBadge status={user.status?.toLowerCase() || 'pending'} size="sm" />
                                    </div>
                                </div>
                                {isSupplier && (
                                    <div>
                                        <span className="text-slate-500 dark:text-slate-400">{t('admin.users.kycStatus')}:</span>
                                        <div className="mt-1">
                                            <StatusBadge status={user.kycStatus?.toLowerCase() || 'incomplete'} size="sm" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status Management Section */}
                <div className="space-y-4">
                    <h4 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">settings</span>
                        {t('admin.users.statusManagement') || 'Status Management'}
                    </h4>

                    {/* Account Status */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t('common.status')} <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value as typeof user.status)}
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        >
                            {statusOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* KYC Status (Suppliers only) */}
                    {isSupplier && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {t('admin.users.kycStatus')} <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={selectedKycStatus}
                                onChange={(e) => setSelectedKycStatus(e.target.value as typeof user.kycStatus)}
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                            >
                                {kycStatusOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('admin.users.kycManualNote') || 'KYC verification is handled manually. Update the status based on your verification process.'}
                            </p>
                        </div>
                    )}

                    {/* Reason for Change */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t('admin.users.reasonForChange')}
                        </label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        >
                            <option value="">{t('admin.users.selectReason') || 'Select a reason'}</option>
                            {reasonOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Admin Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t('admin.users.adminNotes')}
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder={t('admin.users.adminNotesPlaceholder') || 'Add any additional notes or comments...'}
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-none"
                        />
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                        {t('admin.users.quickActions') || 'Quick Actions'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {isSupplier && user.status === 'PENDING' && (
                            <>
                                <button
                                    onClick={() => {
                                        setSelectedStatus('APPROVED');
                                        setSelectedKycStatus('VERIFIED');
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                                >
                                    ✓ {t('admin.users.approveSupplier') || 'Approve Supplier'}
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedStatus('REJECTED');
                                        setSelectedKycStatus('REJECTED');
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                >
                                    ✕ {t('admin.users.rejectSupplier') || 'Reject Supplier'}
                                </button>
                            </>
                        )}
                        {user.status !== 'ACTIVE' && (
                            <button
                                onClick={() => setSelectedStatus('ACTIVE')}
                                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                                ⚡ {t('admin.users.activateUser') || 'Activate User'}
                            </button>
                        )}
                        {(user.status === 'ACTIVE' || user.status === 'APPROVED') && (
                            <button
                                onClick={() => setSelectedStatus('DEACTIVATED')}
                                className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                            >
                                ⏸ {t('admin.users.suspendUser') || 'Suspend User'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-5 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                        {loading ? t('common.processing') : t('common.save')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
