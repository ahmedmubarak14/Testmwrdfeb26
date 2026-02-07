import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

export type Transaction = Database['public']['Tables']['transactions']['Row'];

export const transactionsService = {
    async getMyTransactions(userId: string) {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getBalance(userId: string) {
        const { data, error } = await supabase
            .from('users')
            .select('current_balance, credit_limit')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return {
            balance: data?.current_balance ?? 0,
            creditLimit: data?.credit_limit ?? 0
        };
    },

    // Admin only
    async createTransaction(userId: string, type: string, amount: number, description?: string) {
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                user_id: userId,
                type: type as any,
                amount,
                description
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};
