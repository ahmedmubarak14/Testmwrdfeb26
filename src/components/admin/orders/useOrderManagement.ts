import { useMemo, useState } from 'react';
import { canTransitionOrderStatus } from '../../../services/orderStatusService';
import bankTransferService from '../../../services/bankTransferService';
import { Order, PaymentAuditLog, User } from '../../../types/types';
import { logger } from '../../../utils/logger';

type TranslateFn = (...args: any[]) => any;

type ToastLike = {
  success: (message: string) => void;
  error: (message: string) => void;
};

interface UseOrderManagementParams {
  orders: Order[];
  currentUser: User | null;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<Order | null>;
  loadOrders: () => Promise<void>;
  t: TranslateFn;
  toast: ToastLike;
}

export const filterStatusOptions: string[] = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'PAYMENT_CONFIRMED',
  'PROCESSING',
  'READY_FOR_PICKUP',
  'PICKUP_SCHEDULED',
  'OUT_FOR_DELIVERY',
  'IN_TRANSIT',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

export const statusSelectOptions: string[] = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'PAYMENT_CONFIRMED',
  'PROCESSING',
  'READY_FOR_PICKUP',
  'PICKUP_SCHEDULED',
  'OUT_FOR_DELIVERY',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

export function useOrderManagement({
  orders,
  currentUser,
  updateOrder,
  loadOrders,
  t,
  toast,
}: UseOrderManagementParams) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [paymentLinkOrder, setPaymentLinkOrder] = useState<Order | null>(null);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [isSavingPaymentLink, setIsSavingPaymentLink] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [paymentReviewOrder, setPaymentReviewOrder] = useState<Order | null>(null);
  const [paymentReferenceInput, setPaymentReferenceInput] = useState('');
  const [paymentReviewNotes, setPaymentReviewNotes] = useState('');
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isRejectingPayment, setIsRejectingPayment] = useState(false);
  const [selectedOrderAuditLogs, setSelectedOrderAuditLogs] = useState<PaymentAuditLog[]>([]);
  const [isLoadingOrderAuditLogs, setIsLoadingOrderAuditLogs] = useState(false);

  const filteredOrders = useMemo(
    () => (filterStatus === 'all' ? orders : orders.filter((order) => order.status === filterStatus)),
    [filterStatus, orders]
  );

  const statusLabel = (status: string) => {
    const keyMap: Record<string, string> = {
      PENDING_PAYMENT: 'status.pendingPayment',
      AWAITING_CONFIRMATION: 'status.awaiting_confirmation',
      PAYMENT_CONFIRMED: 'status.paymentConfirmed',
      PROCESSING: 'status.processing',
      READY_FOR_PICKUP: 'status.readyForPickup',
      PICKUP_SCHEDULED: 'status.pickupScheduled',
      OUT_FOR_DELIVERY: 'status.outForDelivery',
      SHIPPED: 'status.shipped',
      IN_TRANSIT: 'status.inTransit',
      DELIVERED: 'status.delivered',
      CANCELLED: 'status.cancelled',
    };
    return t(keyMap[status] || status, status);
  };

  const paymentAuditActionLabel = (action: string) => {
    const keyMap: Record<string, string> = {
      REFERENCE_SUBMITTED: 'admin.orders.auditActionReferenceSubmitted',
      REFERENCE_RESUBMITTED: 'admin.orders.auditActionReferenceResubmitted',
      PAYMENT_CONFIRMED: 'admin.orders.auditActionPaymentConfirmed',
      PAYMENT_REJECTED: 'admin.orders.auditActionPaymentRejected',
    };
    return t(keyMap[action] || action, action);
  };

  const openPaymentReviewModal = (order: Order) => {
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'AWAITING_CONFIRMATION') {
      toast.error(t('admin.orders.invalidPaymentReviewStatus', 'This order is not in a payment review state'));
      return;
    }

    setPaymentReviewOrder(order);
    setPaymentReferenceInput(order.paymentReference || '');
    setPaymentReviewNotes(order.paymentNotes || '');
  };

  const closePaymentReviewModal = () => {
    setPaymentReviewOrder(null);
    setPaymentReferenceInput('');
    setPaymentReviewNotes('');
    setIsConfirmingPayment(false);
    setIsRejectingPayment(false);
  };

  const openOrderDetails = async (order: Order) => {
    setSelectedOrderForDetails(order);
    setIsLoadingOrderAuditLogs(true);
    try {
      const logs = await bankTransferService.getPaymentAuditLogs(order.id);
      setSelectedOrderAuditLogs(logs);
    } catch (error) {
      logger.error('Failed to load payment audit logs', error);
      toast.error(t('admin.orders.auditLogLoadFailed', 'Failed to load payment audit history'));
      setSelectedOrderAuditLogs([]);
    } finally {
      setIsLoadingOrderAuditLogs(false);
    }
  };

  const closeOrderDetails = () => {
    setSelectedOrderForDetails(null);
    setSelectedOrderAuditLogs([]);
    setIsLoadingOrderAuditLogs(false);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const currentOrder = orders.find((order) => order.id === id);
      if (currentOrder && !canTransitionOrderStatus(currentOrder.status, newStatus)) {
        toast.error(
          t('admin.orders.invalidStatusTransition', 'Invalid status transition for this order')
        );
        return;
      }

      const isPaymentControlledTransition = currentOrder
        ? (
          newStatus === 'AWAITING_CONFIRMATION'
          || newStatus === 'PAYMENT_CONFIRMED'
          || (currentOrder.status === 'AWAITING_CONFIRMATION' && newStatus === 'PENDING_PAYMENT')
        )
        : false;

      if (isPaymentControlledTransition) {
        toast.error(
          t('admin.orders.paymentTransitionLocked', 'Use payment review actions to manage payment states')
        );
        return;
      }

      const updatedOrder = await updateOrder(id, { status: newStatus as any });
      if (!updatedOrder) {
        throw new Error('Order update failed');
      }
      toast.success(t('admin.orders.statusUpdated'));
    } catch (error) {
      logger.error('Failed to update order status', error);
      toast.error(t('admin.orders.updateFailed'));
    }
  };

  const handleConfirmBankTransferPayment = async () => {
    if (!paymentReviewOrder) return;
    if (!currentUser?.id) {
      toast.error(t('admin.orders.missingAdminSession', 'Admin session is required'));
      return;
    }

    const paymentReference = paymentReferenceInput.trim();
    if (!paymentReference) {
      toast.error(t('errors.paymentReferenceRequired', 'Payment reference is required'));
      return;
    }

    setIsConfirmingPayment(true);
    try {
      await bankTransferService.markOrderAsPaid(
        paymentReviewOrder.id,
        paymentReference,
        paymentReviewNotes.trim() || undefined
      );
      await loadOrders();
      toast.success(t('admin.orders.paymentConfirmed', 'Payment confirmed successfully'));
      closePaymentReviewModal();
    } catch (error) {
      logger.error('Failed to confirm bank transfer payment', error);
      toast.error(t('admin.orders.paymentActionFailed', 'Failed to update payment status'));
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const handleRejectBankTransferPayment = async () => {
    if (!paymentReviewOrder) return;
    if (!currentUser?.id) {
      toast.error(t('admin.orders.missingAdminSession', 'Admin session is required'));
      return;
    }

    const reason = paymentReviewNotes.trim();
    if (!reason) {
      toast.error(t('admin.orders.rejectReasonRequired', 'Please provide a rejection reason'));
      return;
    }

    setIsRejectingPayment(true);
    try {
      await bankTransferService.rejectPaymentSubmission(paymentReviewOrder.id, reason);
      await loadOrders();
      toast.success(t('admin.orders.paymentRejected', 'Payment request sent back to pending'));
      closePaymentReviewModal();
    } catch (error) {
      logger.error('Failed to reject bank transfer payment', error);
      toast.error(t('admin.orders.paymentActionFailed', 'Failed to update payment status'));
    } finally {
      setIsRejectingPayment(false);
    }
  };

  const isReviewAwaitingConfirmation = paymentReviewOrder?.status === 'AWAITING_CONFIRMATION';
  const canConfirmPayment = Boolean(paymentReferenceInput.trim()) && !isConfirmingPayment && !isRejectingPayment;
  const canRejectPayment = Boolean(paymentReviewNotes.trim()) && Boolean(isReviewAwaitingConfirmation) && !isConfirmingPayment && !isRejectingPayment;

  const openPaymentLinkModal = (order: Order) => {
    setPaymentLinkOrder(order);
    setPaymentLinkUrl(order.paymentLinkUrl || '');
  };

  const closePaymentLinkModal = () => {
    setPaymentLinkOrder(null);
    setPaymentLinkUrl('');
  };

  const handleSavePaymentLink = async () => {
    if (!paymentLinkOrder) return;
    if (!paymentLinkUrl.trim()) {
      toast.error(t('admin.orders.paymentLinkRequired', 'Payment link is required'));
      return;
    }

    setIsSavingPaymentLink(true);
    try {
      const updatedOrder = await updateOrder(paymentLinkOrder.id, {
        paymentLinkUrl: paymentLinkUrl.trim(),
        paymentLinkSentAt: new Date().toISOString(),
      });
      if (!updatedOrder) {
        throw new Error('Payment link update failed');
      }
      toast.success(t('admin.orders.paymentLinkSaved', 'Payment link saved'));
      closePaymentLinkModal();
    } catch (error) {
      logger.error('Failed to save payment link', error);
      toast.error(t('admin.orders.paymentLinkSaveFailed', 'Failed to save payment link'));
    } finally {
      setIsSavingPaymentLink(false);
    }
  };

  const copyPaymentLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('admin.orders.paymentLinkCopied', 'Payment link copied'));
    } catch (error) {
      logger.error('Failed to copy payment link', error);
      toast.error(t('admin.orders.paymentLinkCopyFailed', 'Failed to copy payment link'));
    }
  };

  return {
    filterStatus,
    setFilterStatus,
    filteredOrders,
    paymentLinkOrder,
    paymentLinkUrl,
    setPaymentLinkUrl,
    isSavingPaymentLink,
    selectedOrderForDetails,
    paymentReviewOrder,
    paymentReferenceInput,
    setPaymentReferenceInput,
    paymentReviewNotes,
    setPaymentReviewNotes,
    isConfirmingPayment,
    isRejectingPayment,
    selectedOrderAuditLogs,
    isLoadingOrderAuditLogs,
    statusLabel,
    paymentAuditActionLabel,
    openPaymentReviewModal,
    closePaymentReviewModal,
    openOrderDetails,
    closeOrderDetails,
    handleStatusChange,
    handleConfirmBankTransferPayment,
    handleRejectBankTransferPayment,
    canConfirmPayment,
    canRejectPayment,
    openPaymentLinkModal,
    closePaymentLinkModal,
    handleSavePaymentLink,
    copyPaymentLink,
  };
}
