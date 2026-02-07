# User Stories and Process Documentation

Based on the official MWRD B2B Marketplace requirements.

## 1. User Stories

### 1.1 Client Portal
**Authentication & Onboarding**
- As a client, I want to register with my company details (CR, Tax ID) so I can be verified.
- As a client, I want to log in securely to access the marketplace.

**Browsing & RFQ**
- As a client, I want to browse products by category and view details (images, specifications).
- As a client, I want to add products to an RFQ (Request for Quote) bucket.
- As a client, I want to specify delivery location and required date for my RFQ.
- As a client, I want to set an expiry date for my RFQ.
- As a client, I want to view my RFQ history and status.

**Quoting & Ordering**
- As a client, I want to receive notifications when quotes are ready.
- As a client, I want to compare quotes from different suppliers side-by-side.
- As a client, I want to see a breakdown of items, unit prices, and total cost.
- As a client, I want to accept a quote to generate a Purchase Order (PO).
- As a client, I want to pay via multiple methods (Mada, Visa, Bank Transfer).

**Order Management**
- As a client, I want to track the status of my order (Processing, In Transit, Delivered).
- As a client, I want to rate the supplier after delivery.

### 1.2 Supplier Portal
**Onboarding**
- As a supplier, I want to register and upload my credentials for KYC.
- As a supplier, I want to manage my profile and payment settings.

**Catalog Management**
- As a supplier, I want to upload products individually or via bulk sheet.
- As a supplier, I want to set stock levels and base prices for my products.

**RFQ & Quoting**
- As a supplier, I want to receive notifications for relevant new RFQs.
- As a supplier, I want to submit a custom quote for an RFQ.
- As a supplier, I want to suggest alternative products if requested items are out of stock.
- As a supplier, I want to set a validity period for my quote.

**Order Fulfillment**
- As a supplier, I want to receive POs when my quote is accepted.
- As a supplier, I want to update the order status (Ready for Pickup, etc.).
- As a supplier, I want to print shipping labels/manifests.

### 1.3 Admin Portal
**User Management**
- As an admin, I want to approve/reject client and supplier registrations.
- As an admin, I want to manage platform fees and subscription plans.

**Product & Quote Management**
- As an admin, I want to approve/reject new product listings.
- As an admin, I want to configure the "MWRD Margin" that is added to supplier prices.
- As an admin, I want to oversee all RFQs and Quotes.

**Automation & Logistics**
- As an admin, I want to configure the "Auto-Quote" timer (e.g., 30 mins) to automatically generate quotes if suppliers don't respond.
- As an admin, I want to assign logistics providers to orders.

---

## 2. Key Process Logic

### 2.1 The "Broker Model" (Margins)
The platform acts as a broker. Clients do NOT see the Supplier's base price.
1.  **Supplier Price**: The price the supplier sets (e.g., 100 SAR).
2.  **MWRD Margin**: A percentage added by the platform (e.g., 10%).
3.  **Client Price**: The final price shown to the client (110 SAR).

### 2.2 Auto-Quote System
To ensure speed, the system features an Auto-Quote mechanism:
1.  Client submits RFQ.
2.  Suppliers are notified.
3.  **Timer Starts**: Suppliers have a configurable window (e.g., 30 minutes) to submit a *Custom Quote* (perhaps with a discount).
4.  **Auto-Generation**: If the timer expires and no custom quote is sent, the system automatically generates a quote using the Supplier's **Catalog Price** + **MWRD Margin**.
5.  This ensures clients always get a price quickly.

### 2.3 Order Status Workflow
The granular lifecycle of an order:
1.  **Pending Payment**: Quote accepted, awaiting payment.
2.  **Confirmed**: Payment received, PO generated.
3.  **Processing**: Supplier is preparing the items.
4.  **Ready for Pickup**: Packed and ready for logistics.
5.  **Pickup Scheduled**: Courier assigned and scheduled.
6.  **In Transit**: Order picked up and on the way.
7.  **Delivered**: Successfully received by client.
8.  **Cancelled**: Cancelled by admin or client (if applicable).

---

## 3. Data Flow

1.  **Client** -> Creates RFQ -> **Database** (Status: OPEN).
2.  **System** -> Notifies eligible **Suppliers**.
3.  **Supplier** -> Submits Quote -> **Database** (Status: PENDING_ADMIN).
4.  **Admin/System** -> Applies Margin -> **Database** (Status: SENT_TO_CLIENT).
5.  **Client** -> Accepts Quote -> **Database** (Order Created, Status: PENDING_PAYMENT).
6.  **Payment Gateway** -> Confirms Payment -> **Database** (Status: CONFIRMED).
7.  **Supplier** -> Updates Status -> **Database** (Processing -> Ready).
8.  **Logistics** -> Updates Status -> **Database** (In Transit -> Delivered).
