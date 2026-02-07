import { PaymentStatus } from './payment';
export { PaymentStatus };

export enum UserRole {
  GUEST = 'GUEST',
  CLIENT = 'CLIENT',
  SUPPLIER = 'SUPPLIER',
  ADMIN = 'ADMIN',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string;
  verified: boolean;
  // For anonymization
  publicId?: string;
  rating?: number;
  // Profile
  profilePicture?: string;
  // Supplier Management Fields
  status?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION' | 'ACTIVE' | 'DEACTIVATED';
  kycStatus?: 'VERIFIED' | 'IN_REVIEW' | 'REJECTED' | 'INCOMPLETE';
  dateJoined?: string;
  // Financial Fields
  creditLimit?: number;
  clientMargin?: number;
  creditUsed?: number;
  phone?: string;
}

export type CreditLimitAdjustmentType = 'SET' | 'INCREASE' | 'DECREASE';

export interface CreditLimitAdjustment {
  id: string;
  clientId: string;
  adminId: string;
  adjustmentType: CreditLimitAdjustmentType;
  adjustmentAmount: number;
  changeAmount: number;
  previousLimit: number;
  newLimit: number;
  reason: string;
  createdAt: string;
  adminName?: string;
}

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  image: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  supplierPrice?: number; // Price set by the supplier (mapped from cost_price in DB)
  retailPrice?: number; // Price clients see (cost + margin)
  marginPercent?: number; // MWRD's margin percentage
  sku?: string;
  stock?: number; // Available stock quantity
  brand?: string; // Brand from Master Product or manually entered
}

export interface RFQItem {
  productId: string;
  quantity: number;
  notes: string;
}

export interface RFQ {
  id: string;
  clientId: string;
  items: RFQItem[];
  status: 'OPEN' | 'QUOTED' | 'CLOSED';
  date: string;
  createdAt: string; // ISO timestamp for auto-quote timer
  autoQuoteTriggered?: boolean;
  validUntil?: string;
}

export interface SystemConfig {
  autoQuoteDelayMinutes: number;
  defaultMarginPercent: number;
  lastAutoQuoteCheck?: string;
}

export interface Quote {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierPrice: number; // Price supplier sets
  leadTime: string;
  marginPercent: number; // Admin sets this
  finalPrice: number; // Price client sees (supplierPrice + margin)
  status: 'PENDING_ADMIN' | 'SENT_TO_CLIENT' | 'ACCEPTED' | 'REJECTED';
}

export enum OrderStatus {
  PENDING_PO = 'PENDING_PO',
  CONFIRMED = 'CONFIRMED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PROCESSING = 'PROCESSING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  PICKUP_SCHEDULED = 'PICKUP_SCHEDULED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  SHIPPED = 'SHIPPED', // Deprecated in favor of OUT_FOR_DELIVERY, kept for backward compat if needed
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export type PaymentAuditAction =
  | 'REFERENCE_SUBMITTED'
  | 'REFERENCE_RESUBMITTED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED';

export interface PaymentAuditLog {
  id: string;
  orderId: string;
  actorUserId?: string;
  actorRole?: UserRole;
  action: PaymentAuditAction;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  paymentReference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ShipmentDetails {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDeliveryDate?: string;
  shippedDate: string;
  notes?: string;
}

export interface Order {
  id: string;
  quoteId?: string;
  system_po_number?: string;
  clientId: string;
  supplierId: string;
  amount: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  date: string;
  paymentReference?: string;
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: string;
  paymentNotes?: string;
  paymentReceiptUrl?: string;
  paymentSubmittedAt?: string;
  paymentLinkUrl?: string;
  paymentLinkSentAt?: string;

  // Logistics
  shipment?: ShipmentDetails;

  // PO & Verification Flow
  system_po_generated?: boolean;
  client_po_uploaded?: boolean;
  admin_verified?: boolean;
  admin_verified_by?: string;
  admin_verified_at?: string;

  items?: any; // JSON structure for order items

  createdAt?: string;
  updatedAt?: string;
}

export interface BankDetails {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  branchName?: string;
  branchCode?: string;
  currency: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum CustomRequestStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ASSIGNED = 'ASSIGNED',
  QUOTED = 'QUOTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum RequestPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface CustomItemRequest {
  id: string;
  clientId: string;
  // Request details
  itemName: string;
  description: string;
  specifications?: string;
  category?: string;
  // Quantity and pricing
  quantity: number;
  targetPrice?: number;
  currency: string;
  // Additional info
  deadline?: string;
  priority: RequestPriority;
  referenceImages?: string[];
  attachmentUrls?: string[];
  // Status tracking
  status: CustomRequestStatus;
  adminNotes?: string;
  assignedTo?: string;
  assignedAt?: string;
  assignedBy?: string;
  // Response
  supplierQuoteId?: string;
  respondedAt?: string;
  rejectionReason?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  currentUser: User | null;
}
