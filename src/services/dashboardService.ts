import { logger } from '@/src/utils/logger';
import { formatCurrencyCompact } from '../utils/currency';
import { supabase } from '../lib/supabase';

export interface DashboardStats {
    totalSales: number;
    totalOrders: number;
    averageMargin: number;
    pendingProducts: number;
    pendingUsers: number;
}

class DashboardService {
    private static instance: DashboardService;

    private constructor() { }

    static getInstance(): DashboardService {
        if (!DashboardService.instance) {
            DashboardService.instance = new DashboardService();
        }
        return DashboardService.instance;
    }

    /**
     * Fetches aggregated dashboard statistics from the database.
     * Relies on the Postgres RPC 'get_admin_dashboard_stats'.
     */
    async getAdminStats(): Promise<DashboardStats | null> {
        try {
            const { data, error } = await supabase.rpc('get_admin_dashboard_stats');

            if (error) {
                logger.error('Error fetching dashboard stats:', error);
                return null;
            }

            return data as unknown as DashboardStats;
        } catch (err) {
            logger.error('Unexpected error in getAdminStats:', err);
            return null;
        }
    }

    /**
     * Helper to format currency values (compact, no decimals for dashboard display)
     */
    formatCurrency(value: number): string {
        return formatCurrencyCompact(value);
    }

    /**
     * Helper to format percentage values
     */
    formatPercent(value: number): string {
        return `${value.toFixed(1)}%`;
    }
}

export const dashboardService = DashboardService.getInstance();
