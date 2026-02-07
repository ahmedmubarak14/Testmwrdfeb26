import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const ORDER_DOCUMENTS_BUCKET = 'order-documents';
const STORAGE_REF_PREFIX = `storage://${ORDER_DOCUMENTS_BUCKET}/`;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface OrderDocument {
    id: string;
    order_id: string;
    document_type: 'SYSTEM_PO' | 'CLIENT_PO';
    file_url: string;
    file_name?: string;
    uploaded_by: string;
    verified_by?: string;
    verified_at?: string;
    created_at: string;
    updated_at: string;
}

function buildStorageRef(path: string): string {
    return `${STORAGE_REF_PREFIX}${path}`;
}

function extractStoragePath(fileRef: string): string | null {
    if (!fileRef || fileRef.startsWith('/api/')) {
        return null;
    }

    if (fileRef.startsWith(STORAGE_REF_PREFIX)) {
        return fileRef.slice(STORAGE_REF_PREFIX.length);
    }

    if (fileRef.startsWith(`${ORDER_DOCUMENTS_BUCKET}/`)) {
        return fileRef.slice(`${ORDER_DOCUMENTS_BUCKET}/`.length);
    }

    if (fileRef.startsWith('http://') || fileRef.startsWith('https://')) {
        try {
            const parsed = new URL(fileRef);
            const publicPrefix = `/storage/v1/object/public/${ORDER_DOCUMENTS_BUCKET}/`;
            const signedPrefix = `/storage/v1/object/sign/${ORDER_DOCUMENTS_BUCKET}/`;

            if (parsed.pathname.includes(publicPrefix)) {
                return decodeURIComponent(parsed.pathname.split(publicPrefix)[1] || '');
            }

            if (parsed.pathname.includes(signedPrefix)) {
                return decodeURIComponent(parsed.pathname.split(signedPrefix)[1] || '');
            }
        } catch {
            return null;
        }
    }

    if (fileRef.startsWith('/')) {
        const publicPrefix = `/storage/v1/object/public/${ORDER_DOCUMENTS_BUCKET}/`;
        const signedPrefix = `/storage/v1/object/sign/${ORDER_DOCUMENTS_BUCKET}/`;

        if (fileRef.includes(publicPrefix)) {
            return decodeURIComponent((fileRef.split(publicPrefix)[1] || '').split('?')[0]);
        }

        if (fileRef.includes(signedPrefix)) {
            return decodeURIComponent((fileRef.split(signedPrefix)[1] || '').split('?')[0]);
        }
    }

    return null;
}

async function resolveDocumentAccessUrl(fileRef: string): Promise<string> {
    if (!fileRef) {
        return fileRef;
    }

    if (fileRef.startsWith('/api/')) {
        return fileRef;
    }

    const storagePath = extractStoragePath(fileRef);
    if (!storagePath) {
        return fileRef;
    }

    const { data, error } = await supabase.storage
        .from(ORDER_DOCUMENTS_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
        logger.warn('Unable to create signed URL for order document', {
            storagePath,
            error: error?.message
        });
        return fileRef;
    }

    return data.signedUrl;
}

async function mapOrderDocumentWithResolvedUrl<T extends { file_url: string }>(doc: T): Promise<T> {
    const resolvedUrl = await resolveDocumentAccessUrl(doc.file_url);
    return {
        ...doc,
        file_url: resolvedUrl
    };
}

export const orderDocumentService = {
    /**
     * Upload client PO document
     */
    async uploadClientPO(orderId: string, file: File, userId: string): Promise<OrderDocument> {
        try {
            // 1. Upload file to Supabase Storage
            const fileName = `${orderId}_client_po_${Date.now()}.pdf`;
            const { error: uploadError } = await supabase.storage
                .from(ORDER_DOCUMENTS_BUCKET)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;
            const fileRef = buildStorageRef(fileName);

            // 3. Insert document record
            const { data, error } = await supabase
                .from('order_documents')
                .insert({
                    order_id: orderId,
                    document_type: 'CLIENT_PO',
                    file_url: fileRef,
                    file_name: file.name,
                    uploaded_by: userId
                })
                .select()
                .single();

            if (error) throw error;

            // 4. Update order status to PENDING_PO
            await supabase
                .from('orders')
                .update({
                    status: 'PENDING_PO',
                    client_po_uploaded: true
                })
                .eq('id', orderId);

            return data;
        } catch (error) {
            logger.error('Error uploading client PO:', error);
            throw error;
        }
    },

    /**
     * Generate and store system PO reference (and file if provided)
     */
    async generateSystemPO(orderId: string, userId: string, fileBlob?: Blob): Promise<OrderDocument> {
        try {
            let fileUrl = `/api/generate-po/${orderId}`;
            const fileName = `MWRD_PO_${orderId}.pdf`;

            // If blob provided, upload it
            if (fileBlob) {
                const storageFileName = `${orderId}_system_po_${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from(ORDER_DOCUMENTS_BUCKET)
                    .upload(storageFileName, fileBlob, {
                        contentType: 'application/pdf',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (!uploadError) {
                    fileUrl = buildStorageRef(storageFileName);
                } else {
                    logger.error('Error uploading generated System PO:', uploadError);
                }
            }

            const { data, error } = await supabase
                .from('order_documents')
                .insert({
                    order_id: orderId,
                    document_type: 'SYSTEM_PO',
                    file_url: fileUrl,
                    file_name: fileName,
                    uploaded_by: userId
                })
                .select()
                .single();

            if (error) throw error;

            // Update order to indicate system PO generated
            await supabase
                .from('orders')
                .update({ system_po_generated: true })
                .eq('id', orderId);

            return data;
        } catch (error) {
            logger.error('Error generating system PO:', error);
            throw error;
        }
    },

    /**
     * Get all documents for an order
     */
    async getOrderDocuments(orderId: string): Promise<OrderDocument[]> {
        const { data, error } = await supabase
            .from('order_documents')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Error fetching order documents:', error);
            throw error;
        }

        const documents = data || [];
        return Promise.all(documents.map((doc) => mapOrderDocumentWithResolvedUrl(doc)));
    },

    /**
     * Get a specific document
     */
    async getDocument(documentId: string): Promise<OrderDocument | null> {
        const { data, error } = await supabase
            .from('order_documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (error) {
            logger.error('Error fetching document:', error);
            return null;
        }

        return mapOrderDocumentWithResolvedUrl(data);
    },

    /**
     * Admin: Verify client PO
     */
    async verifyClientPO(documentId: string): Promise<void> {
        try {
            // Atomic DB transaction: verify document + decrement inventory + move order to payment stage.
            const { error } = await supabase.rpc('verify_client_po_and_confirm_order', {
                p_document_id: documentId
            });

            if (error) throw error;

        } catch (error) {
            logger.error('Error verifying client PO:', error);
            throw error;
        }
    },

    /**
     * Download a document (returns blob URL)
     */
    async downloadDocument(filePath: string): Promise<Blob> {
        const storagePath = extractStoragePath(filePath) || filePath;
        const { data, error } = await supabase.storage
            .from(ORDER_DOCUMENTS_BUCKET)
            .download(storagePath);

        if (error) throw error;
        return data;
    },

};
