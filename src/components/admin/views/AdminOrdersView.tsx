import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../hooks/useToast';
import { appConfig } from '../../../config/appConfig';
import { OrdersTable } from '../orders/OrdersTable';
import { PaymentLinkModal } from '../orders/PaymentLinkModal';
import { PaymentReviewModal } from '../orders/PaymentReviewModal';
import { OrderDetailsModal } from '../orders/OrderDetailsModal';
import { filterStatusOptions, statusSelectOptions, useOrderManagement } from '../orders/useOrderManagement';

interface AdminOrdersViewProps {
  exportToCSV: (data: any[], filename: string) => void;
}

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({ exportToCSV }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { orders, updateOrder, currentUser, loadOrders } = useStore();

  const {
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
  } = useOrderManagement({
    orders,
    currentUser,
    updateOrder,
    loadOrders,
    t,
    toast,
  });

  const handleExportOrders = () => {
    const rows = filteredOrders.map((order) => ({
      id: order.id,
      date: order.date,
      amount: order.amount,
      status: order.status,
      supplier_id: order.supplierId,
      client_id: order.clientId,
    }));
    exportToCSV(rows, 'admin_orders');
    toast.success(t('admin.orders.exported', 'Orders exported'));
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      <OrdersTable
        filterStatus={filterStatus}
        filteredOrders={filteredOrders}
        filterStatusOptions={filterStatusOptions}
        statusSelectOptions={statusSelectOptions}
        statusLabel={statusLabel}
        onFilterStatusChange={setFilterStatus}
        onExport={handleExportOrders}
        onStatusChange={handleStatusChange}
        onOpenPaymentReview={openPaymentReviewModal}
        onCopyPaymentLink={copyPaymentLink}
        onOpenPaymentLink={openPaymentLinkModal}
        onOpenOrderDetails={openOrderDetails}
        enableExternalPaymentLinks={appConfig.payment.enableExternalPaymentLinks}
      />

      {appConfig.payment.enableExternalPaymentLinks && (
        <PaymentLinkModal
          order={paymentLinkOrder}
          paymentLinkUrl={paymentLinkUrl}
          isSaving={isSavingPaymentLink}
          onPaymentLinkUrlChange={setPaymentLinkUrl}
          onCancel={closePaymentLinkModal}
          onSave={handleSavePaymentLink}
        />
      )}

      <PaymentReviewModal
        order={paymentReviewOrder}
        paymentReferenceInput={paymentReferenceInput}
        paymentReviewNotes={paymentReviewNotes}
        isConfirmingPayment={isConfirmingPayment}
        isRejectingPayment={isRejectingPayment}
        canConfirmPayment={canConfirmPayment}
        canRejectPayment={canRejectPayment}
        statusLabel={statusLabel}
        onPaymentReferenceInputChange={setPaymentReferenceInput}
        onPaymentReviewNotesChange={setPaymentReviewNotes}
        onClose={closePaymentReviewModal}
        onReject={handleRejectBankTransferPayment}
        onConfirm={handleConfirmBankTransferPayment}
      />

      <OrderDetailsModal
        order={selectedOrderForDetails}
        paymentAuditLogs={selectedOrderAuditLogs}
        isLoadingOrderAuditLogs={isLoadingOrderAuditLogs}
        enableExternalPaymentLinks={appConfig.payment.enableExternalPaymentLinks}
        paymentAuditActionLabel={paymentAuditActionLabel}
        onClose={closeOrderDetails}
      />
    </div>
  );
};
