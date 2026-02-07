import React from 'react';
import { useTranslation } from 'react-i18next';
import { getStockStatus, LOW_STOCK_THRESHOLD } from '../../services/inventoryService';

interface StockBadgeProps {
    stock: number;
    size?: 'sm' | 'md' | 'lg';
    showCount?: boolean;
    className?: string;
}

export const StockBadge: React.FC<StockBadgeProps> = ({
    stock,
    size = 'md',
    showCount = true,
    className = ''
}) => {
    const { t } = useTranslation();
    const status = getStockStatus(stock);

    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-1',
        lg: 'text-base px-3 py-1.5'
    };

    const statusConfig = {
        in_stock: {
            bg: 'bg-green-100',
            text: 'text-green-700',
            border: 'border-green-200',
            icon: 'check_circle',
            label: t('inventory.inStock') || 'In Stock'
        },
        low_stock: {
            bg: 'bg-amber-100',
            text: 'text-amber-700',
            border: 'border-amber-200',
            icon: 'warning',
            label: t('inventory.lowStock') || 'Low Stock'
        },
        out_of_stock: {
            bg: 'bg-red-100',
            text: 'text-red-700',
            border: 'border-red-200',
            icon: 'cancel',
            label: t('inventory.outOfStock') || 'Out of Stock'
        }
    };

    const config = statusConfig[status];

    return (
        <span
            className={`
                inline-flex items-center gap-1 rounded-full border font-medium
                ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}
                ${className}
            `}
        >
            <span className={`material-symbols-outlined ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'}`}>
                {config.icon}
            </span>
            {showCount ? (
                <span>{stock} {t('inventory.units') || 'units'}</span>
            ) : (
                <span>{config.label}</span>
            )}
        </span>
    );
};

interface StockIndicatorProps {
    stock: number;
    className?: string;
}

/**
 * Compact stock indicator - just colored dot + number
 */
export const StockIndicator: React.FC<StockIndicatorProps> = ({ stock, className = '' }) => {
    const status = getStockStatus(stock);

    const dotColors = {
        in_stock: 'bg-green-500',
        low_stock: 'bg-amber-500',
        out_of_stock: 'bg-red-500'
    };

    return (
        <span className={`inline-flex items-center gap-1.5 ${className}`}>
            <span className={`w-2 h-2 rounded-full ${dotColors[status]}`} />
            <span className="text-sm text-neutral-600">{stock}</span>
        </span>
    );
};

interface LowStockWarningProps {
    stock: number;
    threshold?: number;
}

/**
 * Inline warning message for low stock
 */
export const LowStockWarning: React.FC<LowStockWarningProps> = ({
    stock,
    threshold = LOW_STOCK_THRESHOLD
}) => {
    const { t } = useTranslation();

    if (stock > threshold) return null;

    if (stock <= 0) {
        return (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-1">
                <span className="material-symbols-outlined text-base">error</span>
                <span>{t('inventory.outOfStockWarning') || 'This item is out of stock'}</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 text-amber-600 text-sm mt-1">
            <span className="material-symbols-outlined text-base">warning</span>
            <span>
                {t('inventory.lowStockWarning', { count: stock }) || `Only ${stock} left in stock`}
            </span>
        </div>
    );
};

export default StockBadge;
