import { logger } from '@/src/utils/logger';
import { supabase } from '../lib/supabase';

export interface StockInfo {
    productId: string;
    productName: string;
    currentStock: number;
    supplierId: string;
    supplierName?: string;
    category?: string;
    status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface StockUpdate {
    productId: string;
    previousStock: number;
    newStock: number;
    changeAmount: number;
    reason: 'order_confirmed' | 'manual_adjustment' | 'restock' | 'correction';
    orderId?: string;
    updatedBy: string;
    updatedAt: string;
}

// Default threshold for low stock warning
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Get stock level for a specific product
 */
export async function getStockLevel(productId: string): Promise<number> {
    const { data, error } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();

    if (error) {
        logger.error('Error fetching stock level:', error);
        throw error;
    }

    return data?.stock_quantity ?? 0;
}

/**
 * Update stock to a specific quantity
 */
export async function updateStock(
    productId: string,
    newQuantity: number,
    userId: string,
    reason: StockUpdate['reason'] = 'manual_adjustment'
): Promise<void> {
    // Get current stock for logging
    const currentStock = await getStockLevel(productId);

    const { error } = await supabase
        .from('products')
        .update({
            stock_quantity: newQuantity,
            updated_at: new Date().toISOString()
        })
        .eq('id', productId);

    if (error) {
        logger.error('Error updating stock_quantity:', error);
        throw error;
    }

    // Log the change (could be persisted to a stock_history table later)
    logger.info('Stock updated', {
        productId,
        previousStock: currentStock,
        newStock: newQuantity,
        changeAmount: newQuantity - currentStock,
        reason,
        updatedBy: userId,
        updatedAt: new Date().toISOString()
    });
}

/**
 * Decrement stock by a specific quantity (e.g., when order is confirmed)
 */
export async function decrementStock(
    productId: string,
    quantity: number,
    userId: string,
    orderId?: string
): Promise<{ success: boolean; newStock: number; error?: string }> {
    const { data, error } = await supabase.rpc('decrement_stock_atomic', {
        p_product_id: productId,
        p_quantity: quantity
    });

    if (error) {
        logger.error('Error decrementing stock atomically:', error);
        throw error;
    }

    const result = Array.isArray(data) ? data[0] : null;
    if (!result) {
        return {
            success: false,
            newStock: 0,
            error: 'Inventory decrement did not return a result'
        };
    }

    if (!result.success) {
        return {
            success: false,
            newStock: result.new_stock ?? result.previous_stock ?? 0,
            error: result.error ?? 'Unable to decrement stock'
        };
    }

    const previousStock = result.previous_stock ?? 0;
    const newStock = result.new_stock ?? 0;

    logger.info('Stock decremented', {
        productId,
        previousStock,
        newStock,
        decrementedBy: quantity,
        orderId,
        updatedBy: userId,
        updatedAt: new Date().toISOString()
    });

    return { success: true, newStock };
}

/**
 * Increment stock (e.g., for restocking or order cancellation)
 */
export async function incrementStock(
    productId: string,
    quantity: number,
    userId: string,
    reason: 'restock' | 'order_cancelled' = 'restock'
): Promise<{ success: boolean; newStock: number }> {
    const currentStock = await getStockLevel(productId);
    const newStock = currentStock + quantity;

    const { error } = await supabase
        .from('products')
        .update({
            stock_quantity: newStock,
            updated_at: new Date().toISOString()
        })
        .eq('id', productId);

    if (error) {
        logger.error('Error incrementing stock_quantity:', error);
        throw error;
    }

    logger.info('Stock incremented', {
        productId,
        previousStock: currentStock,
        newStock,
        incrementedBy: quantity,
        reason,
        updatedBy: userId,
        updatedAt: new Date().toISOString()
    });

    return { success: true, newStock };
}

/**
 * Get all products with low stock (below threshold)
 */
export async function getLowStockProducts(
    threshold: number = LOW_STOCK_THRESHOLD
): Promise<StockInfo[]> {
    const { data, error } = await supabase
        .from('products')
        .select(`
            id,
            name,
            stock_quantity,
            supplier_id,
            category,
            users:supplier_id (
                name,
                company_name
            )
        `)
        .lte('stock_quantity', threshold)
        .order('stock_quantity', { ascending: true });

    if (error) {
        logger.error('Error fetching low stock products:', error);
        throw error;
    }

    return (data || []).map(product => ({
        productId: product.id,
        productName: product.name,
        currentStock: product.stock_quantity,
        supplierId: product.supplier_id,
        supplierName: (product.users as any)?.company_name || (product.users as any)?.name || 'Unknown',
        category: product.category,
        status: getStockStatus(product.stock_quantity)
    }));
}

/**
 * Get all out of stock products
 */
export async function getOutOfStockProducts(): Promise<StockInfo[]> {
    return getLowStockProducts(0);
}

/**
 * Get stock status based on quantity
 */
export function getStockStatus(stock: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
    if (stock <= 0) return 'out_of_stock';
    if (stock <= LOW_STOCK_THRESHOLD) return 'low_stock';
    return 'in_stock';
}

/**
 * Get inventory summary for dashboard
 */
export async function getInventorySummary(): Promise<{
    totalProducts: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalStockValue: number;
}> {
    const { data, error } = await supabase
        .from('products')
        .select('id, stock_quantity, cost_price');

    if (error) {
        logger.error('Error fetching inventory summary:', error);
        throw error;
    }

    const products = data || [];

    return {
        totalProducts: products.length,
        inStock: products.filter(p => p.stock_quantity > LOW_STOCK_THRESHOLD).length,
        lowStock: products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= LOW_STOCK_THRESHOLD).length,
        outOfStock: products.filter(p => p.stock_quantity <= 0).length,
        totalStockValue: products.reduce((sum, p) => sum + (p.stock_quantity * (p.cost_price || 0)), 0)
    };
}

/**
 * Get all products with stock info for inventory management
 */
export async function getAllProductsWithStock(): Promise<StockInfo[]> {
    const { data, error } = await supabase
        .from('products')
        .select(`
            id,
            name,
            stock_quantity,
            supplier_id,
            category,
            users:supplier_id (
                name,
                company_name
            )
        `)
        .order('stock_quantity', { ascending: true });

    if (error) {
        logger.error('Error fetching products with stock_quantity:', error);
        throw error;
    }

    return (data || []).map(product => ({
        productId: product.id,
        productName: product.name,
        currentStock: product.stock_quantity ?? 0,
        supplierId: product.supplier_id,
        supplierName: (product.users as any)?.company_name || (product.users as any)?.name || 'Unknown',
        category: product.category,
        status: getStockStatus(product.stock_quantity ?? 0)
    }));
}

/**
 * Bulk update stock for multiple products
 */
export async function bulkUpdateStock(
    updates: Array<{ productId: string; newStock: number }>,
    userId: string
): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const update of updates) {
        try {
            await updateStock(update.productId, update.newStock, userId, 'manual_adjustment');
            success++;
        } catch (error) {
            logger.error(`Failed to update stock for ${update.productId}:`, error);
            failed++;
        }
    }

    return { success, failed };
}

/**
 * Get all products for a specific supplier with stock info
 */
export async function getSupplierProducts(supplierId: string): Promise<StockInfo[]> {
    const { data, error } = await supabase
        .from('products')
        .select(`
            id,
            name,
            stock_quantity,
            supplier_id,
            category,
            users:supplier_id (
                name,
                company_name
            )
        `)
        .eq('supplier_id', supplierId)
        .order('name', { ascending: true });

    if (error) {
        logger.error('Error fetching supplier products:', error);
        throw error;
    }

    return (data || []).map(product => ({
        productId: product.id,
        productName: product.name,
        currentStock: product.stock_quantity ?? 0,
        supplierId: product.supplier_id,
        supplierName: (product.users as any)?.company_name || (product.users as any)?.name || 'Unknown',
        category: product.category,
        status: getStockStatus(product.stock_quantity ?? 0)
    }));
}

export const inventoryService = {
    getStockLevel,
    updateStock,
    decrementStock,
    incrementStock,
    getLowStockProducts,
    getOutOfStockProducts,
    getStockStatus,
    getInventorySummary,
    getAllProductsWithStock,
    getSupplierProducts,
    bulkUpdateStock,
    LOW_STOCK_THRESHOLD
};
