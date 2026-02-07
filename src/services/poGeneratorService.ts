import { Quote, Order, RFQ, Product, User } from '../types/types';
import { appConfig } from '../config/appConfig';

const ORDER_DOCUMENTS_BUCKET = 'order-documents';
const ORDER_DOCUMENTS_STORAGE_REF_PREFIX = `storage://${ORDER_DOCUMENTS_BUCKET}/`;

export interface POData {
    order: Order;
    quote: Quote;
    rfq: RFQ;
    products: Product[];
    client: User;
    supplier?: User;
}

let jsPdfConstructorPromise: Promise<typeof import('jspdf')['jsPDF']> | null = null;

async function loadJsPdfConstructor(): Promise<typeof import('jspdf')['jsPDF']> {
    if (!jsPdfConstructorPromise) {
        jsPdfConstructorPromise = import('jspdf/dist/jspdf.es.min.js').then((module: any) => module.jsPDF);
    }

    return jsPdfConstructorPromise;
}

export const poGeneratorService = {
    /**
     * Generate a MWRD System Purchase Order PDF
     */
    async generateSystemPO(data: POData): Promise<Blob> {
        const jsPDF = await loadJsPdfConstructor();
        const vatRatePercent = appConfig.pricing.vatRatePercent;
        const vatRate = vatRatePercent / 100;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        let y = margin;

        // --- HEADER ---
        // Company Logo Area
        doc.setFillColor(10, 37, 64); // MWRD Navy
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('MWRD', margin, 25);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Managed B2B Marketplace', margin, 33);

        // PO Number (Right side)
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const poNumber = `PO-${data.order.id.slice(0, 8).toUpperCase()}`;
        doc.text(poNumber, pageWidth - margin - 50, 25);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const today = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        doc.text(`Date: ${today}`, pageWidth - margin - 50, 33);

        y = 55;

        // --- PURCHASE ORDER TITLE ---
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' });
        y += 15;

        // --- CLIENT INFO BOX ---
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, y, (pageWidth - margin * 2) / 2 - 5, 45, 'F');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        doc.text('BILL TO:', margin + 5, y + 10);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.text(data.client.companyName || data.client.name, margin + 5, y + 20);
        doc.setFontSize(9);
        doc.text(data.client.email, margin + 5, y + 28);

        // --- ORDER INFO BOX ---
        const rightBoxX = margin + (pageWidth - margin * 2) / 2 + 5;
        doc.setFillColor(245, 247, 250);
        doc.rect(rightBoxX, y, (pageWidth - margin * 2) / 2 - 5, 45, 'F');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        doc.text('ORDER DETAILS:', rightBoxX + 5, y + 10);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(`Order ID: ${data.order.id.slice(0, 12)}`, rightBoxX + 5, y + 20);
        doc.text(`RFQ ID: ${data.rfq.id.slice(0, 12)}`, rightBoxX + 5, y + 28);
        doc.text(`Quote ID: ${data.quote.id.slice(0, 12)}`, rightBoxX + 5, y + 36);

        y += 55;

        // --- ITEMS TABLE ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Order Items', margin, y);
        y += 8;

        // Table Header
        doc.setFillColor(19, 127, 236); // Primary blue
        doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text('Item', margin + 5, y + 7);
        doc.text('Qty', margin + 90, y + 7);
        doc.text('Unit Price', margin + 110, y + 7);
        doc.text('Total', pageWidth - margin - 25, y + 7);

        y += 10;
        doc.setTextColor(0, 0, 0);

        // Table Rows
        let subtotal = 0;
        data.rfq.items.forEach((item, index) => {
            const product = data.products.find(p => p.id === item.productId);
            const productName = product?.name || `Product ${item.productId.slice(0, 8)}`;

            // Estimate price per item (finalPrice / total quantity)
            const totalQty = data.rfq.items.reduce((sum, i) => sum + i.quantity, 0);
            if (totalQty <= 0) {
                throw new Error('Cannot generate PO: total quantity must be greater than zero');
            }
            const unitPrice = data.quote.finalPrice / totalQty;
            const lineTotal = unitPrice * item.quantity;
            subtotal += lineTotal;

            // Alternate row colors
            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
            }

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(productName.substring(0, 40), margin + 5, y + 7);
            doc.text(item.quantity.toString(), margin + 90, y + 7);
            doc.text(`SAR ${unitPrice.toFixed(2)}`, margin + 110, y + 7);
            doc.text(`SAR ${lineTotal.toFixed(2)}`, pageWidth - margin - 25, y + 7);

            y += 10;
        });

        // Totals section
        y += 5;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin + 100, y, pageWidth - margin, y);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.text('Subtotal:', margin + 110, y);
        doc.text(`SAR ${subtotal.toFixed(2)}`, pageWidth - margin - 25, y);

        y += 8;
        doc.text(`VAT (${vatRatePercent}%):`, margin + 110, y);
        const vat = subtotal * vatRate;
        doc.text(`SAR ${vat.toFixed(2)}`, pageWidth - margin - 25, y);

        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('TOTAL:', margin + 110, y);
        doc.text(`SAR ${(subtotal + vat).toFixed(2)}`, pageWidth - margin - 25, y);

        y += 20;

        // --- TERMS & CONDITIONS ---
        doc.setFillColor(255, 250, 240);
        doc.rect(margin, y, pageWidth - margin * 2, 35, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text('Terms & Conditions:', margin + 5, y + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text('1. Payment is due within 30 days of invoice date.', margin + 5, y + 18);
        doc.text('2. This PO is subject to MWRD standard terms and conditions.', margin + 5, y + 24);
        doc.text('3. Please sign, stamp, and return a copy of this PO to confirm the order.', margin + 5, y + 30);

        y += 45;

        // --- SIGNATURE SECTION ---
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Client Signature & Stamp:', margin, y);

        doc.setDrawColor(150, 150, 150);
        doc.setLineDashPattern([3, 3], 0);
        doc.rect(margin, y + 5, 80, 30);

        doc.text('Authorized by MWRD:', pageWidth - margin - 80, y);
        doc.rect(pageWidth - margin - 80, y + 5, 80, 30);

        // --- FOOTER ---
        const footerY = doc.internal.pageSize.getHeight() - 15;
        doc.setLineDashPattern([], 0);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text('MWRD - Managed B2B Marketplace | www.mwrd.com | support@mwrd.com', pageWidth / 2, footerY, { align: 'center' });

        // Return as Blob
        return doc.output('blob');
    },

    /**
     * Download the generated PO
     */
    async downloadPO(data: POData): Promise<void> {
        const blob = await this.generateSystemPO(data);
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `MWRD_PO_${data.order.id.slice(0, 8).toUpperCase()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    },

    /**
     * Upload generated PO to Supabase Storage
     */
    async uploadGeneratedPO(data: POData, supabase: any): Promise<string> {
        const blob = await this.generateSystemPO(data);
        const fileName = `system_po_${data.order.id}_${Date.now()}.pdf`;

        const { error } = await supabase.storage
            .from(ORDER_DOCUMENTS_BUCKET)
            .upload(fileName, blob, {
                contentType: 'application/pdf',
                cacheControl: '3600'
            });

        if (error) throw error;
        return `${ORDER_DOCUMENTS_STORAGE_REF_PREFIX}${fileName}`;
    }
};
