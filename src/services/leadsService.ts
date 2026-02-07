
import { supabase } from '../lib/supabase';

export interface Lead {
    id?: string;
    name: string;
    company_name: string;
    email: string;
    phone?: string;
    account_type: 'client' | 'supplier';
    notes?: string;
    status?: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED';
    created_at?: string;
}

export const leadsService = {
    async submitLead(lead: Lead) {
        const { data, error } = await supabase
            .from('leads')
            .insert({
                name: lead.name,
                company_name: lead.company_name,
                email: lead.email,
                phone: lead.phone,
                account_type: lead.account_type,
                notes: lead.notes
            });

        if (error) throw error;
        return { success: true };
    },

    async getLeads() {
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Lead[];
    },

    async updateLeadStatus(id: string, status: Lead['status']) {
        const { data, error } = await supabase
            .from('leads')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};
