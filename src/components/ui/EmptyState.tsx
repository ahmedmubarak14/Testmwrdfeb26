import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileSearch, ShoppingCart, MessageSquare, Package, ClipboardList, Users, CreditCard } from 'lucide-react';

type EmptyStateType = 'rfqs' | 'quotes' | 'orders' | 'products' | 'users' | 'payments' | 'general';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  type = 'general',
  title,
  description,
  action 
}) => {
  const { t } = useTranslation();

  const getIcon = () => {
    switch (type) {
      case 'rfqs':
        return <ClipboardList className="w-12 h-12 text-gray-300" />;
      case 'quotes':
        return <MessageSquare className="w-12 h-12 text-gray-300" />;
      case 'orders':
        return <ShoppingCart className="w-12 h-12 text-gray-300" />;
      case 'products':
        return <Package className="w-12 h-12 text-gray-300" />;
      case 'users':
        return <Users className="w-12 h-12 text-gray-300" />;
      case 'payments':
        return <CreditCard className="w-12 h-12 text-gray-300" />;
      default:
        return <FileSearch className="w-12 h-12 text-gray-300" />;
    }
  };

  const getDefaultContent = () => {
    switch (type) {
      case 'rfqs':
        return {
          title: t('empty.rfqs.title', 'No RFQs yet'),
          description: t('empty.rfqs.description', 'Create your first request for quote to get started')
        };
      case 'quotes':
        return {
          title: t('empty.quotes.title', 'No quotes yet'),
          description: t('empty.quotes.description', 'Quotes will appear here when suppliers respond')
        };
      case 'orders':
        return {
          title: t('empty.orders.title', 'No orders yet'),
          description: t('empty.orders.description', 'Your orders will appear here after placing them')
        };
      case 'products':
        return {
          title: t('empty.products.title', 'No products yet'),
          description: t('empty.products.description', 'Add your first product to start selling')
        };
      case 'users':
        return {
          title: t('empty.users.title', 'No users found'),
          description: t('empty.users.description', 'Users will appear here when they register')
        };
      case 'payments':
        return {
          title: t('empty.payments.title', 'No payments yet'),
          description: t('empty.payments.description', 'Payment records will appear here')
        };
      default:
        return {
          title: t('empty.general.title', 'Nothing here yet'),
          description: t('empty.general.description', 'Data will appear here once available')
        };
    }
  };

  const defaults = getDefaultContent();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4 p-4 bg-gray-50 rounded-full">
        {getIcon()}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {title || defaults.title}
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        {description || defaults.description}
      </p>
      {action && (
        <div>{action}</div>
      )}
    </div>
  );
};
