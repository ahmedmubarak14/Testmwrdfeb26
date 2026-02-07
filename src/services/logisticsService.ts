
import { supabase } from '../lib/supabase';
import { OrderStatus, ShipmentDetails } from '../types/types';
import type { Json } from '../types/database';
import { canTransitionOrderStatus } from './orderStatusService';

async function getCurrentOrderStatus(orderId: string): Promise<OrderStatus> {
    const { data, error } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

    if (error) throw error;

    const status = data?.status as OrderStatus | undefined;
    if (!status) {
        throw new Error('Order not found');
    }

    return status;
}

export const logisticsService = {

    /**
     * Update shipment details for an order
     */
    async createShipment(orderId: string, shipment: ShipmentDetails): Promise<void> {
        const currentStatus = await getCurrentOrderStatus(orderId);
        const nextStatus: OrderStatus = OrderStatus.OUT_FOR_DELIVERY;

        if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
            throw new Error(
                `Invalid order status transition: ${currentStatus} -> ${nextStatus}`
            );
        }

        const { data, error } = await supabase
            .from('orders')
            .update({
                status: nextStatus,
                shipment_details: shipment as unknown as Json,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('status', currentStatus)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            throw new Error('Order status changed before shipment could be created. Please refresh and retry.');
        }
    },

    /**
     * Update tracking information
     */
    async updateTracking(orderId: string, trackingNumber: string, url?: string): Promise<void> {
        // First, get current shipment details
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('shipment_details')
            .eq('id', orderId)
            .single();

        if (fetchError) throw fetchError;

        const currentShipment = (order?.shipment_details as Record<string, unknown> | null) || {};

        const updatedShipment = {
            ...(currentShipment as Record<string, unknown>),
            trackingNumber,
            trackingUrl: url
        };

        const { error } = await supabase
            .from('orders')
            .update({
                shipment_details: updatedShipment as unknown as Json,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;
    },

    /**
     * Mark order as delivered
     */
    async markAsDelivered(orderId: string): Promise<void> {
        const currentStatus = await getCurrentOrderStatus(orderId);
        const nextStatus: OrderStatus = OrderStatus.DELIVERED;

        if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
            throw new Error(
                `Invalid order status transition: ${currentStatus} -> ${nextStatus}`
            );
        }

        const { data, error } = await supabase
            .from('orders')
            .update({
                status: nextStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('status', currentStatus)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            throw new Error('Order status changed before delivery update could be applied. Please refresh and retry.');
        }
    },

    /**
     * Get shipment history/details for an order
     */
    async getShipmentDetails(orderId: string): Promise<ShipmentDetails | null> {
        const { data, error } = await supabase
            .from('orders')
            .select('shipment_details, status')
            .eq('id', orderId)
            .single();

        if (error) throw error;
        return (data?.shipment_details as unknown as ShipmentDetails | null) || null;
    }
};
