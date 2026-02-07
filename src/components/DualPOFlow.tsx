import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orderDocumentService } from '../services/orderDocumentService';
import { poGeneratorService, POData } from '../services/poGeneratorService';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { logger } from '../utils/logger';

interface DualPOFlowProps {
    orderId: string;
    quoteId: string;
    onComplete: () => void;
    onCancel: () => void;
}

export const DualPOFlow: React.FC<DualPOFlowProps> = ({ orderId, quoteId, onComplete, onCancel }) => {
    const { t } = useTranslation();
    const toast = useToast();
    const { currentUser, orders, quotes, rfqs, products } = useStore(state => ({
        currentUser: state.currentUser,
        orders: state.orders,
        quotes: state.quotes,
        rfqs: state.rfqs,
        products: state.products
    }));

    const [step, setStep] = useState<'download' | 'upload' | 'pending'>('download');
    const [uploading, setUploading] = useState(false);
    const [downloadedPO, setDownloadedPO] = useState(false);
    const [generating, setGenerating] = useState(false);

    const handleDownloadPO = async () => {
        try {
            if (!currentUser) return;
            setGenerating(true);

            // Find the order, quote, and RFQ data
            const order = orders.find(o => o.id === orderId);
            const quote = quotes.find(q => q.id === quoteId);
            const rfq = quote ? rfqs.find(r => r.id === quote.rfqId) : null;

            if (!order || !quote || !rfq) {
                toast.error('Could not find order details');
                return;
            }

            // Build PO data
            const poData: POData = {
                order,
                quote,
                rfq,
                products,
                client: currentUser
            };

            // Generate and download the PDF
            await poGeneratorService.downloadPO(poData);

            // Generate Blob for upload
            const pdfBlob = await poGeneratorService.generateSystemPO(poData);

            // Record in database and upload file
            await orderDocumentService.generateSystemPO(orderId, currentUser.id, pdfBlob);

            setDownloadedPO(true);
            toast.success(t('client.po.downloadSuccess') || 'PO downloaded successfully');

            // Move to upload step after a short delay
            setTimeout(() => setStep('upload'), 1000);
        } catch (error) {
            logger.error('Error downloading PO:', error);
            toast.error(t('client.po.downloadError') || 'Failed to download PO');
        } finally {
            setGenerating(false);
        }
    };

    const handleUploadPO = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;

        // Validate file type
        if (file.type !== 'application/pdf') {
            toast.error(t('client.po.invalidFileType') || 'Please upload a PDF file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t('client.po.fileTooLarge') || 'File size must be less than 5MB');
            return;
        }

        setUploading(true);
        try {
            await orderDocumentService.uploadClientPO(orderId, file, currentUser.id);
            setStep('pending');
            toast.success(t('client.po.uploadSuccess') || 'PO uploaded successfully');

            // Call completion handler after short delay
            setTimeout(() => onComplete(), 1500);
        } catch (error) {
            logger.error('Upload failed:', error);
            toast.error(t('client.po.uploadError') || 'Failed to upload PO');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full p-8">
                {/* Progress Indicator */}
                <div className="flex items-center justify-center mb-8">
                    <div className="flex items-center gap-4">
                        {/* Step 1 */}
                        <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'download'
                                ? 'bg-blue-600 text-white'
                                : 'bg-green-600 text-white'
                                }`}>
                                <span className="material-symbols-outlined text-sm">
                                    {downloadedPO ? 'check' : 'download'}
                                </span>
                            </div>
                            <span className="text-xs mt-2 font-medium">
                                {t('client.po.step1') || 'Download PO'}
                            </span>
                        </div>

                        {/* Connector */}
                        <div className={`w-16 h-0.5 ${downloadedPO ? 'bg-green-600' : 'bg-neutral-300'}`} />

                        {/* Step 2 */}
                        <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'upload'
                                ? 'bg-blue-600 text-white'
                                : step === 'pending'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-neutral-300 text-neutral-500'
                                }`}>
                                <span className="material-symbols-outlined text-sm">
                                    {step === 'pending' ? 'check' : 'upload'}
                                </span>
                            </div>
                            <span className="text-xs mt-2 font-medium">
                                {t('client.po.step2') || 'Upload PO'}
                            </span>
                        </div>

                        {/* Connector */}
                        <div className={`w-16 h-0.5 ${step === 'pending' ? 'bg-green-600' : 'bg-neutral-300'}`} />

                        {/* Step 3 */}
                        <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 'pending'
                                ? 'bg-blue-600 text-white'
                                : 'bg-neutral-300 text-neutral-500'
                                }`}>
                                <span className="material-symbols-outlined text-sm">pending</span>
                            </div>
                            <span className="text-xs mt-2 font-medium">
                                {t('client.po.step3') || 'Verification'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Step Content */}
                <div className="min-h-[300px] flex flex-col items-center justify-center">
                    {/* Step 1: Download System PO */}
                    {step === 'download' && (
                        <div className="text-center max-w-md">
                            <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
                                <span className="material-symbols-outlined text-blue-600 text-4xl">description</span>
                            </div>
                            <h3 className="text-xl font-bold mb-4 text-neutral-800">
                                {t('client.po.downloadTitle') || 'Step 1: Download System Purchase Order'}
                            </h3>
                            <p className="text-neutral-600 mb-6">
                                {t('client.po.downloadDesc') || 'Download the MWRD Purchase Order, print it, and stamp it with your company seal.'}
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={onCancel}
                                    className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 font-medium"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={handleDownloadPO}
                                    disabled={generating}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined">
                                        {generating ? 'hourglass_empty' : 'download'}
                                    </span>
                                    {generating
                                        ? (t('client.po.generating') || 'Generating...')
                                        : (t('client.po.downloadButton') || 'Download PO')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Upload Client PO */}
                    {step === 'upload' && (
                        <div className="text-center max-w-md">
                            <div className="inline-block p-4 bg-green-100 rounded-full mb-4">
                                <span className="material-symbols-outlined text-green-600 text-4xl">upload_file</span>
                            </div>
                            <h3 className="text-xl font-bold mb-4 text-neutral-800">
                                {t('client.po.uploadTitle') || 'Step 2: Upload Stamped Purchase Order'}
                            </h3>
                            <p className="text-neutral-600 mb-6">
                                {t('client.po.uploadDesc') || 'Upload your company\'s stamped and signed PO to confirm the order.'}
                            </p>

                            {/* File Upload Area */}
                            <label className="cursor-pointer block">
                                <div className="border-2 border-dashed border-neutral-300 rounded-lg p-8 hover:border-blue-500 hover:bg-blue-50 transition-colors">
                                    <span className="material-symbols-outlined text-neutral-400 text-5xl mb-2">cloud_upload</span>
                                    <p className="text-neutral-700 font-medium mb-1">
                                        {uploading ? t('client.po.uploading') || 'Uploading...' : t('client.po.clickToUpload') || 'Click to upload'}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        {t('client.po.pdfOnly') || 'PDF only, max 5MB'}
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    onChange={handleUploadPO}
                                    className="hidden"
                                    disabled={uploading}
                                />
                            </label>

                            <button
                                onClick={onCancel}
                                className="mt-4 px-4 py-2 text-neutral-600 hover:text-neutral-800"
                                disabled={uploading}
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    )}

                    {/* Step 3: Pending Approval */}
                    {step === 'pending' && (
                        <div className="text-center max-w-md">
                            <div className="inline-block p-4 bg-green-100 rounded-full mb-4">
                                <span className="material-symbols-outlined text-green-600 text-4xl">check_circle</span>
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-neutral-800">
                                {t('client.po.successTitle') || 'PO Uploaded Successfully!'}
                            </h3>
                            <p className="text-neutral-600 mb-6">
                                {t('client.po.successDesc') || 'Your order is pending admin verification. You\'ll be notified once confirmed.'}
                            </p>
                            <div className="bg-blue-50 p-4 rounded-lg">
                                <p className="text-sm text-blue-800">
                                    <span className="font-semibold">{t('client.po.orderStatus') || 'Order Status'}:</span>{' '}
                                    {t('client.po.pendingVerification') || 'Pending Verification'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
