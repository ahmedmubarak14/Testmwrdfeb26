import { logger } from '@/src/utils/logger';
// ============================================================================
// CUSTOM ITEM REQUEST SERVICE
// ============================================================================

import { supabase } from '../lib/supabase';
import { CustomRequestStatus, RequestPriority, type CustomItemRequest } from '../types/types';
import type { Database } from '../types/database';

type CustomRequestRow = Database['public']['Tables']['custom_item_requests']['Row'];

function mapDbRequestToModel(row: CustomRequestRow): CustomItemRequest {
  return {
    id: row.id,
    clientId: row.client_id,
    itemName: row.item_name,
    description: row.description,
    specifications: row.specifications ?? undefined,
    category: row.category ?? undefined,
    quantity: row.quantity,
    targetPrice: row.target_price ?? undefined,
    currency: row.currency,
    deadline: row.deadline ?? undefined,
    priority: row.priority as RequestPriority,
    referenceImages: row.reference_images ?? undefined,
    attachmentUrls: row.attachment_urls ?? undefined,
    status: row.status as CustomRequestStatus,
    adminNotes: row.admin_notes ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
    assignedBy: row.assigned_by ?? undefined,
    supplierQuoteId: row.supplier_quote_id ?? undefined,
    respondedAt: row.responded_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapModelUpdateToDb(additionalData?: Partial<CustomItemRequest>) {
  if (!additionalData) return {};
  const updateData: Record<string, unknown> = {};

  if (additionalData.itemName !== undefined) updateData.item_name = additionalData.itemName;
  if (additionalData.description !== undefined) updateData.description = additionalData.description;
  if (additionalData.specifications !== undefined) updateData.specifications = additionalData.specifications;
  if (additionalData.category !== undefined) updateData.category = additionalData.category;
  if (additionalData.quantity !== undefined) updateData.quantity = additionalData.quantity;
  if (additionalData.targetPrice !== undefined) updateData.target_price = additionalData.targetPrice;
  if (additionalData.currency !== undefined) updateData.currency = additionalData.currency;
  if (additionalData.deadline !== undefined) updateData.deadline = additionalData.deadline;
  if (additionalData.priority !== undefined) updateData.priority = additionalData.priority;
  if (additionalData.referenceImages !== undefined) updateData.reference_images = additionalData.referenceImages;
  if (additionalData.attachmentUrls !== undefined) updateData.attachment_urls = additionalData.attachmentUrls;
  if (additionalData.status !== undefined) updateData.status = additionalData.status;
  if (additionalData.adminNotes !== undefined) updateData.admin_notes = additionalData.adminNotes;
  if (additionalData.assignedTo !== undefined) updateData.assigned_to = additionalData.assignedTo;
  if (additionalData.assignedAt !== undefined) updateData.assigned_at = additionalData.assignedAt;
  if (additionalData.assignedBy !== undefined) updateData.assigned_by = additionalData.assignedBy;
  if (additionalData.supplierQuoteId !== undefined) updateData.supplier_quote_id = additionalData.supplierQuoteId;
  if (additionalData.respondedAt !== undefined) updateData.responded_at = additionalData.respondedAt;
  if (additionalData.rejectionReason !== undefined) updateData.rejection_reason = additionalData.rejectionReason;

  return updateData;
}

// ============================================================================
// REQUEST OPERATIONS
// ============================================================================

/**
 * Create a custom item request
 */
export async function createCustomRequest(
  request: Omit<CustomItemRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<CustomItemRequest> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .insert([{
      client_id: request.clientId,
      item_name: request.itemName,
      description: request.description,
      specifications: request.specifications,
      category: request.category,
      quantity: request.quantity,
      target_price: request.targetPrice,
      currency: request.currency,
      deadline: request.deadline,
      priority: request.priority,
      reference_images: request.referenceImages,
      attachment_urls: request.attachmentUrls,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create request: ${error.message}`);
  return mapDbRequestToModel(data);
}

/**
 * Get custom request by ID
 */
export async function getCustomRequestById(requestId: string): Promise<CustomItemRequest | null> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error) {
    logger.error('Error fetching request:', error);
    return null;
  }

  return mapDbRequestToModel(data);
}

/**
 * Get all custom requests for a client
 */
export async function getClientCustomRequests(clientId: string): Promise<CustomItemRequest[]> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch requests: ${error.message}`);
  return (data || []).map(mapDbRequestToModel);
}

/**
 * Get all pending custom requests (Admin)
 */
export async function getPendingCustomRequests(): Promise<CustomItemRequest[]> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .select('*')
    .in('status', ['PENDING', 'UNDER_REVIEW'])
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch pending requests: ${error.message}`);
  return (data || []).map(mapDbRequestToModel);
}

/**
 * Get custom requests assigned to supplier
 */
export async function getSupplierCustomRequests(supplierId: string): Promise<CustomItemRequest[]> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .select('*')
    .eq('assigned_to', supplierId)
    .order('created_at', { ascending: false});

  if (error) throw new Error(`Failed to fetch assigned requests: ${error.message}`);
  return (data || []).map(mapDbRequestToModel);
}

/**
 * Update custom request status
 */
export async function updateCustomRequestStatus(
  requestId: string,
  status: CustomRequestStatus,
  additionalData?: Partial<CustomItemRequest>
): Promise<CustomItemRequest> {
  const updateData = {
    status,
    ...mapModelUpdateToDb(additionalData),
  };

  const { data, error } = await supabase
    .from('custom_item_requests')
    .update(updateData)
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update request: ${error.message}`);
  return mapDbRequestToModel(data);
}

/**
 * Assign custom request to supplier (Admin)
 */
export async function assignCustomRequestToSupplier(
  requestId: string,
  supplierId: string,
  notes?: string
): Promise<CustomItemRequest> {
  const { data, error } = await supabase.rpc('assign_custom_request', {
    p_request_id: requestId,
    p_supplier_id: supplierId,
    p_notes: notes,
  });

  if (error) throw new Error(`Failed to assign request: ${error.message}`);
  return mapDbRequestToModel(data);
}

/**
 * Update request with admin notes
 */
export async function updateAdminNotes(
  requestId: string,
  notes: string
): Promise<CustomItemRequest> {
  const { data, error} = await supabase
    .from('custom_item_requests')
    .update({ admin_notes: notes })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update notes: ${error.message}`);
  return mapDbRequestToModel(data);
}

/**
 * Cancel custom request (Client)
 */
export async function cancelCustomRequest(
  requestId: string,
  clientId: string
): Promise<CustomItemRequest> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .update({ status: 'CANCELLED' })
    .eq('id', requestId)
    .eq('client_id', clientId)
    .in('status', ['PENDING', 'UNDER_REVIEW'])
    .select()
    .single();

  if (error) throw new Error(`Failed to cancel request: ${error.message}`);
  return mapDbRequestToModel(data);
}

/**
 * Reject custom request (Admin)
 */
export async function rejectCustomRequest(
  requestId: string,
  reason: string
): Promise<CustomItemRequest> {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .update({
      status: 'REJECTED',
      rejection_reason: reason,
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(`Failed to reject request: ${error.message}`);
  return mapDbRequestToModel(data);
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get custom request statistics (Admin)
 */
export async function getCustomRequestStats() {
  const { data, error } = await supabase
    .from('custom_item_requests')
    .select('status, priority');

  if (error) throw new Error(`Failed to fetch stats: ${error.message}`);

  const stats = {
    total: data?.length || 0,
    byStatus: {
      pending: 0,
      underReview: 0,
      assigned: 0,
      quoted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    },
    byPriority: {
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
  };

  data?.forEach(item => {
    // Count by status
    switch (item.status) {
      case 'PENDING':
        stats.byStatus.pending++;
        break;
      case 'UNDER_REVIEW':
        stats.byStatus.underReview++;
        break;
      case 'ASSIGNED':
        stats.byStatus.assigned++;
        break;
      case 'QUOTED':
        stats.byStatus.quoted++;
        break;
      case 'APPROVED':
        stats.byStatus.approved++;
        break;
      case 'REJECTED':
        stats.byStatus.rejected++;
        break;
      case 'CANCELLED':
        stats.byStatus.cancelled++;
        break;
    }

    // Count by priority
    switch (item.priority) {
      case 'URGENT':
        stats.byPriority.urgent++;
        break;
      case 'HIGH':
        stats.byPriority.high++;
        break;
      case 'MEDIUM':
        stats.byPriority.medium++;
        break;
      case 'LOW':
        stats.byPriority.low++;
        break;
    }
  });

  return stats;
}

/**
 * Get client request summary
 */
export async function getClientRequestSummary(clientId: string) {
  const { data, error } = await supabase.rpc('get_client_request_summary', {
    p_client_id: clientId,
  });

  if (error) throw new Error(`Failed to fetch summary: ${error.message}`);
  return data;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get status display text
 */
export function getRequestStatusText(status: CustomRequestStatus): string {
  const statusText: Record<CustomRequestStatus, string> = {
    [CustomRequestStatus.PENDING]: 'Pending Review',
    [CustomRequestStatus.UNDER_REVIEW]: 'Under Review',
    [CustomRequestStatus.ASSIGNED]: 'Assigned to Supplier',
    [CustomRequestStatus.QUOTED]: 'Quote Received',
    [CustomRequestStatus.APPROVED]: 'Approved',
    [CustomRequestStatus.REJECTED]: 'Rejected',
    [CustomRequestStatus.CANCELLED]: 'Cancelled',
  };

  return statusText[status] || status;
}

/**
 * Get priority display text
 */
export function getPriorityText(priority: RequestPriority): string {
  const priorityText: Record<RequestPriority, string> = {
    [RequestPriority.LOW]: 'Low',
    [RequestPriority.MEDIUM]: 'Medium',
    [RequestPriority.HIGH]: 'High',
    [RequestPriority.URGENT]: 'Urgent',
  };

  return priorityText[priority] || priority;
}

/**
 * Get status color class
 */
export function getStatusColorClass(status: CustomRequestStatus): string {
  const colors: Record<CustomRequestStatus, string> = {
    [CustomRequestStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
    [CustomRequestStatus.UNDER_REVIEW]: 'bg-blue-100 text-blue-800',
    [CustomRequestStatus.ASSIGNED]: 'bg-purple-100 text-purple-800',
    [CustomRequestStatus.QUOTED]: 'bg-indigo-100 text-indigo-800',
    [CustomRequestStatus.APPROVED]: 'bg-green-100 text-green-800',
    [CustomRequestStatus.REJECTED]: 'bg-red-100 text-red-800',
    [CustomRequestStatus.CANCELLED]: 'bg-gray-100 text-gray-800',
  };

  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get priority color class
 */
export function getPriorityColorClass(priority: RequestPriority): string {
  const colors: Record<RequestPriority, string> = {
    [RequestPriority.LOW]: 'bg-gray-100 text-gray-700',
    [RequestPriority.MEDIUM]: 'bg-blue-100 text-blue-700',
    [RequestPriority.HIGH]: 'bg-orange-100 text-orange-700',
    [RequestPriority.URGENT]: 'bg-red-100 text-red-700',
  };

  return colors[priority] || 'bg-gray-100 text-gray-700';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const customItemRequestService = {
  // CRUD operations
  createCustomRequest,
  getCustomRequestById,
  getClientCustomRequests,
  getPendingCustomRequests,
  getSupplierCustomRequests,
  updateCustomRequestStatus,
  assignCustomRequestToSupplier,
  updateAdminNotes,
  cancelCustomRequest,
  rejectCustomRequest,

  // Statistics
  getCustomRequestStats,
  getClientRequestSummary,

  // Helpers
  getRequestStatusText,
  getPriorityText,
  getStatusColorClass,
  getPriorityColorClass,
};

export default customItemRequestService;
