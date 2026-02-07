import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

export type MasterProduct = Database['public']['Tables']['master_products']['Row'];
export type MasterProductInsert = Database['public']['Tables']['master_products']['Insert'];
export type MasterProductUpdate = Database['public']['Tables']['master_products']['Update'];

export const masterProductService = {
    async getMasterProducts(category?: string, search?: string) {
        let query = supabase
            .from('master_products')
            .select('*')
            .order('name');

        if (category) {
            query = query.eq('category', category);
        }

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getCategories() {
        const { data, error } = await supabase
            .from('master_products')
            .select('category');

        if (error) throw error;
        return Array.from(new Set(data.map(p => p.category)));
    },

    async addToMyProducts(supplierId: string, masterProduct: MasterProduct, price: number, sku?: string, stock?: number) {
        const { data, error } = await supabase
            .from('products')
            .insert({
                supplier_id: supplierId,
                master_product_id: masterProduct.id,
                name: masterProduct.name,
                description: masterProduct.description || '',
                category: masterProduct.category,
                subcategory: masterProduct.subcategory,
                image: masterProduct.image_url || '',
                brand: masterProduct.brand,
                cost_price: price,
                stock_quantity: stock || 0,
                sku: sku || masterProduct.model_number,
                status: 'APPROVED' // Auto-approve products from Master Catalog
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async createMasterProduct(product: MasterProductInsert) {
        const { data, error } = await supabase
            .from('master_products')
            .insert(product)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateMasterProduct(id: string, updates: MasterProductUpdate) {
        const { data, error } = await supabase
            .from('master_products')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteMasterProduct(id: string) {
        const { error } = await supabase
            .from('master_products')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
