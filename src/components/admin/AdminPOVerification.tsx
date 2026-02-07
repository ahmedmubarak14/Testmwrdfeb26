import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { orderDocumentService, OrderDocument } from '../../services/orderDocumentService';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { StatusBadge } from '../ui/StatusBadge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { logger } from '../../utils/logger';

interface PendingPO {
    document: OrderDocument;
    order: {
        id: string;
        clientId: string;
        amount: number;
        date: string;
    };
    clientName: string;
}

export const AdminPOVerification: React.FC = () => {
    const { t } = useTranslation();
    const toast = useToast();

    // Use individual selectors to prevent infinite re-renders
    const currentUser = useStore(state => state.currentUser);
    const orders = useStore(state => state.orders);
    const users = useStore(state => state.users) || [];
    const updateOrder = useStore(state => state.updateOrder);
    const loadOrders = useStore(state => state.loadOrders);

    const [pendingPOs, setPendingPOs] = useState<PendingPO[]>([]);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<OrderDocument | null>(null);
    const [pendingRejection, setPendingRejection] = useState<PendingPO | null>(null);

    useEffect(() => {
        loadPendingPOs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadPendingPOs = async () => {
        try {
            setLoading(true);
            const pending: PendingPO[] = [];

            // Find orders strictly awaiting PO verification.
            const pendingOrders = orders.filter(o => {
                const status = String(o.status);
                return status === 'PENDING_PO';
            });

            for (const order of pendingOrders) {
                try {
                    const docs = await orderDocumentService.getOrderDocuments(order.id);
                    const clientPO = docs.find(d => d.document_type === 'CLIENT_PO' && !d.verified_by);

                    if (clientPO) {
                        const client = users.find(u => u.id === order.clientId);
                        pending.push({
                            document: clientPO,
                            order: {
                                id: order.id,
                                clientId: order.clientId,
                                amount: order.amount,
                                date: order.date
                            },
                            clientName: client?.companyName || client?.name || 'Unknown Client'
                        });
                    }
                } catch (err) {
                    logger.error(`Error loading docs for order ${order.id}:`, err);
                }
            }

            setPendingPOs(pending);
        } catch (error) {
            logger.error('Error loading pending POs:', error);
            toast.error('Failed to load pending POs');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (documentId: string) => {
        if (!currentUser) return;

        try {
            setVerifying(documentId);
            await orderDocumentService.verifyClientPO(documentId);
            await loadOrders();
            toast.success(t('admin.po.verifySuccess') || 'PO verified successfully');

            // Remove from pending list
            setPendingPOs(prev => prev.filter(p => p.document.id !== documentId));
            setPreviewUrl(null);
            setSelectedDoc(null);
        } catch (error) {
            logger.error('Error verifying PO:', error);
            toast.error(t('admin.po.verifyError') || 'Failed to verify PO');
        } finally {
            setVerifying(null);
        }
    };

    const handlePreview = (doc: OrderDocument) => {
        setSelectedDoc(doc);
        setPreviewUrl(doc.file_url);
    };

    const handleReject = async (documentId: string) => {
        const matchingPendingPO = pendingPOs.find((pending) => pending.document.id === documentId);
        if (!matchingPendingPO) return;
        setPendingRejection(matchingPendingPO);
    };

    const handleConfirmReject = async () => {
        if (!currentUser || !pendingRejection) return;

        try {
            setVerifying(pendingRejection.document.id);
            const updatedOrder = await updateOrder(pendingRejection.order.id, { status: 'CANCELLED' as any });
            if (!updatedOrder) {
                throw new Error('Failed to cancel order');
            }
            await loadOrders();
            toast.success(t('admin.po.rejectSuccess') || 'PO rejected and order cancelled');
            setPendingPOs(prev => prev.filter(p => p.document.id !== pendingRejection.document.id));
            setPreviewUrl(null);
            setSelectedDoc(null);
            setPendingRejection(null);
        } catch (error) {
            logger.error('Error rejecting PO:', error);
            toast.error(t('admin.po.rejectError') || 'Failed to reject PO');
        } finally {
            setVerifying(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-neutral-800">
                        {t('admin.po.title') || 'PO Verification'}
                    </h2>
                    <p className="text-neutral-500">
                        {t('admin.po.description') || 'Review and verify client purchase orders'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                        {pendingPOs.length} {t('admin.po.pending') || 'Pending'}
                    </span>
                    <button
                        onClick={loadPendingPOs}
                        className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <span className="material-symbols-outlined text-neutral-600">refresh</span>
                    </button>
                </div>
            </div>

            {pendingPOs.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
                    <span className="material-symbols-outlined text-6xl text-neutral-300 mb-4">task_alt</span>
                    <h3 className="text-lg font-semibold text-neutral-700 mb-2">
                        {t('admin.po.noPending') || 'No Pending POs'}
                    </h3>
                    <p className="text-neutral-500">
                        {t('admin.po.allVerified') || 'All client POs have been verified'}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {/* PO List */}
                    <div className="space-y-3">
                        {pendingPOs.map((item) => (
                            <div
                                key={item.document.id}
                                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selectedDoc?.id === item.document.id
                                    ? 'border-blue-500 ring-2 ring-blue-100'
                                    : 'border-neutral-200 hover:border-neutral-300'
                                    }`}
                                onClick={() => handlePreview(item.document)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-amber-100 rounded-lg">
                                            <span className="material-symbols-outlined text-amber-600">
                                                description
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-neutral-800">
                                                {item.clientName}
                                            </h4>
                                            <p className="text-sm text-neutral-500">
                                                Order #{item.order.id.slice(0, 8).toUpperCase()}
                                            </p>
                                            <p className="text-sm text-neutral-500">
                                                {new Date(item.document.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-neutral-800">
                                            SAR {item.order.amount?.toLocaleString() || '0'}
                                        </p>
                                        <StatusBadge status="PENDING" size="sm" />
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-100">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleVerify(item.document.id);
                                        }}
                                        disabled={verifying === item.document.id}
                                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {verifying === item.document.id ? (
                                            <>
                                                <span className="animate-spin material-symbols-outlined text-sm">hourglass_empty</span>
                                                {t('common.verifying') || 'Verifying...'}
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                                {t('admin.po.verify') || 'Verify'}
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleReject(item.document.id);
                                        }}
                                        disabled={verifying === item.document.id}
                                        className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {verifying === item.document.id ? (
                                            <>
                                                <span className="animate-spin material-symbols-outlined text-sm">hourglass_empty</span>
                                                {t('common.processing') || 'Processing...'}
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-sm">cancel</span>
                                                {t('admin.po.reject') || 'Reject'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Preview Panel */}
                    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden lg:sticky lg:top-4 lg:h-[600px]">
                        {previewUrl ? (
                            <div className="h-full flex flex-col">
                                <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
                                    <h3 className="font-semibold text-neutral-800">
                                        {t('admin.po.preview') || 'Document Preview'}
                                    </h3>
                                    <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                                        title="Open in new tab"
                                    >
                                        <span className="material-symbols-outlined text-neutral-600">open_in_new</span>
                                    </a>
                                </div>
                                <div className="flex-1 bg-neutral-100">
                                    <iframe
                                        src={previewUrl}
                                        className="w-full h-full"
                                        title="PO Preview"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center p-8">
                                <div>
                                    <span className="material-symbols-outlined text-5xl text-neutral-300 mb-3">preview</span>
                                    <p className="text-neutral-500">
                                        {t('admin.po.selectToPreview') || 'Select a PO to preview'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingRejection)}
                onClose={() => setPendingRejection(null)}
                onConfirm={handleConfirmReject}
                title={t('admin.po.reject') || 'Reject'}
                message={t('admin.po.confirmReject') || 'Reject this PO and cancel the related order?'}
                confirmText={t('admin.po.reject') || 'Reject'}
                type="danger"
                isLoading={Boolean(pendingRejection && verifying === pendingRejection.document.id)}
            />
        </div>
    );
};
