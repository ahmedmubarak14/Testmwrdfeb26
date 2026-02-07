import { RFQ, Quote, Product, SystemConfig, User, UserRole } from '../types/types';
import { logger } from '../utils/logger';

const generateAutoQuoteId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `aq-${crypto.randomUUID()}`;
    }

    return `aq-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
};

export const autoQuoteService = {
    /**
     * Check for RFQs that need auto-quoting
     */
    checkAutoQuotes: (
        rfqs: RFQ[],
        products: Product[],
        users: User[],
        quotes: Quote[],
        config: SystemConfig
    ): { updatedRfqs: RFQ[], newQuotes: Quote[] } => {

        logger.debug('Checking for auto-quotes', { config });
        const now = new Date();
        const newQuotes: Quote[] = [];
        const updatedRfqs: RFQ[] = [];

        // Filter for OPEN rfqs that haven't been auto-quoted/triggered
        const openRfqs = rfqs.filter(r =>
            r.status === 'OPEN' && !r.autoQuoteTriggered
        );

        for (const rfq of openRfqs) {
            const created = new Date(rfq.createdAt);
            const diffMinutes = (now.getTime() - created.getTime()) / (1000 * 60);

            // Rule: If time elapsed > configured delay
            if (diffMinutes >= config.autoQuoteDelayMinutes) {
                logger.debug('RFQ exceeded auto-quote timer. Generating quotes.', {
                    rfqId: rfq.id,
                    elapsedMinutes: Number(diffMinutes.toFixed(1))
                });

                // 1. Mark RFQ as triggered
                const updatedRfq = { ...rfq, autoQuoteTriggered: true };
                updatedRfqs.push(updatedRfq);

                // 2. For each item in RFQ, find potential suppliers
                // In a real system, we'd bundle this smarter, but for now we create quotes for the whole RFQ if possible
                // Or simpler: Find a supplier who has ALL items?
                // Let's go with: Find products that match the RFQ items.

                // Collect all potential products for the items
                let canFulfill = true;
                const fulfillmentPlan: { supplierId: string, items: { productId: string, price: number, leadTime: number }[] }[] = [];

                // Simplified logic:
                // We look for suppliers who sell the exact product IDs requested (since this is an existing catalog flow)
                // Group by Supplier

                const supplierMatches = new Map<string, { price: number, leadTime: string }[]>();

                for (const item of rfq.items) {
                    const product = products.find(p => p.id === item.productId);
                    if (!product) continue;

                    // Assuming the product stores its supplierId
                    if (!supplierMatches.has(product.supplierId)) {
                        supplierMatches.set(product.supplierId, []);
                    }

                    // Use Retail Price (Client Price) - Margin? 
                    // Wait, Quote needs Supplier Price (base) + Margin.
                    // Product has supplierPrice (Supplier Price).
                    // Wait, Quote needs Supplier Price (base) + Margin.

                    supplierMatches.get(product.supplierId)?.push({
                        price: (product.supplierPrice || 0) * item.quantity,
                        leadTime: '3 Days' // Default auto-quote lead time
                    });
                }

                // Generate a quote for each supplier found
                supplierMatches.forEach((items, supplierId) => {
                    const totalSupplierPrice = items.reduce((sum, i) => sum + i.price, 0);

                    const quote: Quote = {
                        id: generateAutoQuoteId(),
                        rfqId: rfq.id,
                        supplierId: supplierId,
                        supplierPrice: totalSupplierPrice,
                        leadTime: '3 Days (Auto)',
                        marginPercent: config.defaultMarginPercent,
                        finalPrice: totalSupplierPrice * (1 + config.defaultMarginPercent / 100),
                        status: 'SENT_TO_CLIENT' // Auto-quotes go straight to client
                    };

                    newQuotes.push(quote);
                    logger.debug('Generated auto-quote', { quoteId: quote.id, supplierId });
                });
            }
        }

        return { updatedRfqs, newQuotes };
    }
};
