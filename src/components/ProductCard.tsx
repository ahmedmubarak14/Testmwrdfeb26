import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Product } from '../types/types';
import { UserRole } from '../types/types';

interface ProductCardProps {
  product: Product;
  userRole?: UserRole;
  onAddToRFQ?: (product: Product) => void;
  onViewDetails?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  userRole = UserRole.CLIENT,
  onAddToRFQ,
  onViewDetails,
}) => {
  const { t } = useTranslation();
  const isSupplierOrAdmin = userRole === UserRole.SUPPLIER || userRole === UserRole.ADMIN;
  const showCostPrice = isSupplierOrAdmin;
  const showRetailPrice = product.retailPrice && product.retailPrice > 0;

  const profitAmount = product.supplierPrice && product.retailPrice
    ? product.retailPrice - product.supplierPrice
    : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = 'https://via.placeholder.com/400x300?text=Product+Image';
          }}
        />
        {product.status === 'PENDING' && (
          <span className="absolute top-3 right-3 px-3 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full">
            {t('status.pendingApproval')}
          </span>
        )}
        {product.sku && (
          <span className="absolute top-3 left-3 px-3 py-1 bg-gray-900 bg-opacity-70 text-white text-xs font-mono rounded">
            {product.sku}
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          {product.category}
        </p>

        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {product.name}
        </h3>

        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
          {product.description}
        </p>

        <div className="border-t border-gray-200 pt-4 space-y-2">
          {showRetailPrice && (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-600">{t('products.price')}</span>
              <div className="text-right">
                <span className="text-2xl font-bold text-[#0A2540]">
                  {product.retailPrice!.toFixed(2)}
                </span>
                <span className="text-sm text-gray-600 ml-1">SAR</span>
              </div>
            </div>
          )}

          {showCostPrice && product.supplierPrice && (
            <div className="space-y-1 text-sm bg-gray-50 rounded-lg p-3 mt-2">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('products.costPrice')}:</span>
                <span className="font-medium text-gray-900">
                  {product.supplierPrice.toFixed(2)} SAR
                </span>
              </div>
              {product.marginPercent && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('products.margin')}:</span>
                  <span className="font-medium text-green-600">
                    {product.marginPercent.toFixed(1)}%
                  </span>
                </div>
              )}
              {showRetailPrice && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('products.retailPrice')}:</span>
                    <span className="font-medium text-gray-900">
                      {product.retailPrice!.toFixed(2)} SAR
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="text-gray-600">{t('products.mwrdProfit')}:</span>
                    <span className="font-bold text-green-600">
                      {profitAmount.toFixed(2)} SAR
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {!showRetailPrice && !showCostPrice && (
            <p className="text-sm text-gray-500 italic">{t('products.requestQuote')}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {onViewDetails && (
            <button
              onClick={() => onViewDetails(product)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              {t('products.viewDetails')}
            </button>
          )}
          {onAddToRFQ && userRole === UserRole.CLIENT && (
            <button
              onClick={() => onAddToRFQ(product)}
              className="flex-1 px-4 py-2 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
              {t('products.addToRfq')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
