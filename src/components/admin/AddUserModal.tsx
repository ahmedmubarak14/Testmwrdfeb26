import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { UserRole } from '../../types/types';

interface AddUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'supplier' | 'client';
    onSave: (data: any) => Promise<void>;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
    isOpen,
    onClose,
    type,
    onSave
}) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        companyName: '',
        email: '',
        phone: '',
        password: '', // In a real app, might auto-generate or invite
        creditLimit: '',
        role: type === 'supplier' ? UserRole.SUPPLIER : UserRole.CLIENT
    });

    // Reset form when modal opens or type changes
    React.useEffect(() => {
        if (isOpen) {
            setFormData({
                name: '',
                companyName: '',
                email: '',
                phone: '',
                password: '',
                creditLimit: '',
                role: type === 'supplier' ? UserRole.SUPPLIER : UserRole.CLIENT
            });
        }
    }, [isOpen, type]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setFormError(null);
        try {
            const parsedCreditLimit = formData.creditLimit === '' ? undefined : Number(formData.creditLimit);
            if (type === 'client' && parsedCreditLimit !== undefined && (!Number.isFinite(parsedCreditLimit) || parsedCreditLimit < 0)) {
                setFormError(t('admin.users.invalidAmount') || 'Enter a valid non-negative amount');
                setLoading(false);
                return;
            }

            await onSave({
                ...formData,
                creditLimit: type === 'client' && parsedCreditLimit !== undefined
                    ? Math.round(parsedCreditLimit * 100) / 100
                    : undefined
            });
            onClose();
        } catch (error) {
            logger.error(error);
        } finally {
            setLoading(false);
        }
    };

    const title = type === 'supplier'
        ? t('admin.users.addSupplier') || 'Add New Supplier'
        : t('admin.users.addClient') || 'Add New Client';

    // Helper to safely get translations or fallbacks
    const getLabel = (key: string, fallback: string) => t(key) || fallback;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                            {getLabel('common.name', 'Contact Name')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            required
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                            {getLabel('common.companyName', 'Company Name')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            required
                            name="companyName"
                            value={formData.companyName}
                            onChange={handleChange}
                            className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                            placeholder="e.g. Acme Corp"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                        {getLabel('common.email', 'Email Address')} <span className="text-red-500">*</span>
                    </label>
                    <input
                        required
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        placeholder="john@example.com"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                        {getLabel('common.phone', 'Phone Number')}
                    </label>
                    <input
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        placeholder="+966 50 123 4567"
                    />
                </div>

                {type === 'client' && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                            {t('admin.users.creditLimit') || 'Credit Limit (USD)'}
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            name="creditLimit"
                            value={formData.creditLimit}
                            onChange={handleChange}
                            className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                            placeholder="0"
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                        {getLabel('common.password', 'Initial Password')} <span className="text-red-500">*</span>
                    </label>
                    <input
                        required
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        placeholder="Set a temporary password"
                        minLength={6}
                    />
                    <p className="text-xs text-gray-500">
                        Min 6 characters. User can change this later.
                    </p>
                </div>

                {formError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {formError}
                    </div>
                )}

                <div className="pt-4 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        {getLabel('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-2"
                    >
                        {loading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                        {getLabel('common.create', 'Create User')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};
