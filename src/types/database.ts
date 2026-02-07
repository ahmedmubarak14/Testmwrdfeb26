// Supabase Database Types
// This file defines the TypeScript types for our Supabase database schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'GUEST' | 'CLIENT' | 'SUPPLIER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REQUIRES_ATTENTION' | 'DEACTIVATED'
export type KycStatus = 'VERIFIED' | 'IN_REVIEW' | 'REJECTED' | 'INCOMPLETE'
export type ProductStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type RfqStatus = 'OPEN' | 'QUOTED' | 'CLOSED'
export type QuoteStatus = 'PENDING_ADMIN' | 'SENT_TO_CLIENT' | 'ACCEPTED' | 'REJECTED'
export type OrderStatus =
  | 'PENDING_PO'
  | 'CONFIRMED'
  | 'PENDING_PAYMENT'
  | 'AWAITING_CONFIRMATION'
  | 'PAYMENT_CONFIRMED'
  | 'PROCESSING'
  | 'READY_FOR_PICKUP'
  | 'PICKUP_SCHEDULED'
  | 'OUT_FOR_DELIVERY'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'AWAITING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED' | 'AUTHORIZED' | 'CAPTURED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED'
export type PaymentMethodType = 'CREDITCARD' | 'MADA' | 'APPLEPAY' | 'STC_PAY' | 'BANK_TRANSFER'
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'
export type CreditLimitAdjustmentType = 'SET' | 'INCREASE' | 'DECREASE'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: UserRole
          company_name: string
          verified: boolean
          public_id: string | null
          rating: number | null
          status: UserStatus | null
          kyc_status: KycStatus | null
          client_margin: number | null
          credit_limit: number | null
          credit_used: number | null
          current_balance: number | null
          date_joined: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          role?: UserRole
          company_name: string
          verified?: boolean
          public_id?: string | null
          rating?: number | null
          status?: UserStatus | null
          kyc_status?: KycStatus | null
          client_margin?: number | null
          credit_limit?: number | null
          credit_used?: number | null
          current_balance?: number | null
          date_joined?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          role?: UserRole
          company_name?: string
          verified?: boolean
          public_id?: string | null
          rating?: number | null
          status?: UserStatus | null
          kyc_status?: KycStatus | null
          client_margin?: number | null
          credit_limit?: number | null
          credit_used?: number | null
          current_balance?: number | null
          date_joined?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_limit_adjustments: {
        Row: {
          id: string
          client_id: string
          admin_id: string
          adjustment_type: CreditLimitAdjustmentType
          adjustment_amount: number
          change_amount: number
          previous_limit: number
          new_limit: number
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          admin_id: string
          adjustment_type: CreditLimitAdjustmentType
          adjustment_amount: number
          change_amount: number
          previous_limit: number
          new_limit: number
          reason: string
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          admin_id?: string
          adjustment_type?: CreditLimitAdjustmentType
          adjustment_amount?: number
          change_amount?: number
          previous_limit?: number
          new_limit?: number
          reason?: string
          created_at?: string
        }
        Relationships: []
      }
      payment_audit_logs: {
        Row: {
          id: string
          order_id: string
          actor_user_id: string | null
          actor_role: UserRole | null
          action: 'REFERENCE_SUBMITTED' | 'REFERENCE_RESUBMITTED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_REJECTED'
          from_status: OrderStatus | null
          to_status: OrderStatus | null
          payment_reference: string | null
          notes: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          actor_user_id?: string | null
          actor_role?: UserRole | null
          action: 'REFERENCE_SUBMITTED' | 'REFERENCE_RESUBMITTED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_REJECTED'
          from_status?: OrderStatus | null
          to_status?: OrderStatus | null
          payment_reference?: string | null
          notes?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          actor_user_id?: string | null
          actor_role?: UserRole | null
          action?: 'REFERENCE_SUBMITTED' | 'REFERENCE_RESUBMITTED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_REJECTED'
          from_status?: OrderStatus | null
          to_status?: OrderStatus | null
          payment_reference?: string | null
          notes?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          name: string
          company_name: string
          email: string
          phone: string | null
          account_type: 'client' | 'supplier'
          notes: string | null
          status: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED'
          created_at: string
          updated_at: string
          converted_user_id: string | null
        }
        Insert: {
          id?: string
          name: string
          company_name: string
          email: string
          phone?: string | null
          account_type: 'client' | 'supplier'
          notes?: string | null
          status?: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED'
          created_at?: string
          updated_at?: string
          converted_user_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          company_name?: string
          email?: string
          phone?: string | null
          account_type?: 'client' | 'supplier'
          notes?: string | null
          status?: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED'
          created_at?: string
          updated_at?: string
          converted_user_id?: string | null
        }
        Relationships: []
      }
      master_products: {
        Row: {
          id: string
          name: string
          description: string | null
          category: string
          subcategory: string | null
          brand: string | null
          model_number: string | null
          specifications: Json | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          category: string
          subcategory?: string | null
          brand?: string | null
          model_number?: string | null
          specifications?: Json | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          category?: string
          subcategory?: string | null
          brand?: string | null
          model_number?: string | null
          specifications?: Json | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: 'CREDIT_USAGE' | 'PAYMENT' | 'REFUND' | 'FEE'
          amount: number
          reference_id: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'CREDIT_USAGE' | 'PAYMENT' | 'REFUND' | 'FEE'
          amount: number
          reference_id?: string | null
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'CREDIT_USAGE' | 'PAYMENT' | 'REFUND' | 'FEE'
          amount?: number
          reference_id?: string | null
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      client_margins: {
        Row: {
          id: string
          client_id: string
          category: string
          margin_percent: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          category: string
          margin_percent: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          category?: string
          margin_percent?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          supplier_id: string
          name: string
          description: string
          category: string
          subcategory: string | null
          image: string
          status: ProductStatus
          cost_price: number | null
          sku: string | null
          master_product_id: string | null
          brand: string | null
          stock_quantity: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          supplier_id: string
          name: string
          description: string
          category: string
          subcategory?: string | null
          image: string
          status?: ProductStatus
          cost_price?: number | null
          sku?: string | null
          master_product_id?: string | null
          brand?: string | null
          stock_quantity?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string
          name?: string
          description?: string
          category?: string
          subcategory?: string | null
          image?: string
          status?: ProductStatus
          cost_price?: number | null
          sku?: string | null
          master_product_id?: string | null
          brand?: string | null
          stock_quantity?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rfqs: {
        Row: {
          id: string
          client_id: string
          status: RfqStatus
          date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          status?: RfqStatus
          date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          status?: RfqStatus
          date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rfq_items: {
        Row: {
          id: string
          rfq_id: string
          product_id: string
          quantity: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          rfq_id: string
          product_id: string
          quantity: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          rfq_id?: string
          product_id?: string
          quantity?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          id: string
          rfq_id: string
          supplier_id: string
          supplier_price: number
          lead_time: string
          margin_percent: number
          final_price: number
          status: QuoteStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          rfq_id: string
          supplier_id: string
          supplier_price: number
          lead_time: string
          margin_percent?: number
          final_price?: number
          status?: QuoteStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          rfq_id?: string
          supplier_id?: string
          supplier_price?: number
          lead_time?: string
          margin_percent?: number
          final_price?: number
          status?: QuoteStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_documents: {
        Row: {
          id: string
          order_id: string
          document_type: 'SYSTEM_PO' | 'CLIENT_PO'
          file_url: string
          file_name: string
          uploaded_by: string
          verified_by: string | null
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          document_type: 'SYSTEM_PO' | 'CLIENT_PO'
          file_url: string
          file_name: string
          uploaded_by: string
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          document_type?: 'SYSTEM_PO' | 'CLIENT_PO'
          file_url?: string
          file_name?: string
          uploaded_by?: string
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          quote_id: string | null
          client_id: string
          supplier_id: string
          amount: number
          status: OrderStatus
          date: string
          items: Json
          system_po_generated: boolean
          client_po_uploaded: boolean
          admin_verified: boolean
          admin_verified_by: string | null
          admin_verified_at: string | null
          payment_link_url: string | null
          payment_link_sent_at: string | null
          payment_reference: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_notes: string | null
          payment_receipt_url: string | null
          payment_submitted_at: string | null
          shipment_details: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          quote_id?: string | null
          client_id: string
          supplier_id: string
          amount: number
          status?: OrderStatus
          date?: string
          items?: Json
          system_po_generated?: boolean
          client_po_uploaded?: boolean
          admin_verified?: boolean
          admin_verified_by?: string | null
          admin_verified_at?: string | null
          payment_link_url?: string | null
          payment_link_sent_at?: string | null
          payment_reference?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          payment_submitted_at?: string | null
          shipment_details?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          quote_id?: string | null
          client_id?: string
          supplier_id?: string
          amount?: number
          status?: OrderStatus
          date?: string
          items?: Json
          system_po_generated?: boolean
          client_po_uploaded?: boolean
          admin_verified?: boolean
          admin_verified_by?: string | null
          admin_verified_at?: string | null
          payment_link_url?: string | null
          payment_link_sent_at?: string | null
          payment_reference?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          payment_submitted_at?: string | null
          shipment_details?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      margin_settings: {
        Row: {
          id: string
          category: string | null
          margin_percent: number
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category?: string | null
          margin_percent: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: string | null
          margin_percent?: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_item_requests: {
        Row: {
          id: string
          client_id: string
          item_name: string
          description: string
          specifications: string | null
          category: string | null
          quantity: number
          target_price: number | null
          currency: string
          deadline: string | null
          priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
          reference_images: string[] | null
          attachment_urls: string[] | null
          status: 'PENDING' | 'UNDER_REVIEW' | 'ASSIGNED' | 'QUOTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
          admin_notes: string | null
          assigned_to: string | null
          assigned_at: string | null
          assigned_by: string | null
          supplier_quote_id: string | null
          responded_at: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          item_name: string
          description: string
          specifications?: string | null
          category?: string | null
          quantity: number
          target_price?: number | null
          currency?: string
          deadline?: string | null
          priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
          reference_images?: string[] | null
          attachment_urls?: string[] | null
          status?: 'PENDING' | 'UNDER_REVIEW' | 'ASSIGNED' | 'QUOTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
          admin_notes?: string | null
          assigned_to?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          supplier_quote_id?: string | null
          responded_at?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          item_name?: string
          description?: string
          specifications?: string | null
          category?: string | null
          quantity?: number
          target_price?: number | null
          currency?: string
          deadline?: string | null
          priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
          reference_images?: string[] | null
          attachment_urls?: string[] | null
          status?: 'PENDING' | 'UNDER_REVIEW' | 'ASSIGNED' | 'QUOTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
          admin_notes?: string | null
          assigned_to?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          supplier_quote_id?: string | null
          responded_at?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_details: {
        Row: {
          id: string
          bank_name: string
          account_name: string
          account_number: string
          iban: string | null
          swift_code: string | null
          branch_name: string | null
          branch_code: string | null
          currency: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bank_name: string
          account_name: string
          account_number: string
          iban?: string | null
          swift_code?: string | null
          branch_name?: string | null
          branch_code?: string | null
          currency?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bank_name?: string
          account_name?: string
          account_number?: string
          iban?: string | null
          swift_code?: string | null
          branch_name?: string | null
          branch_code?: string | null
          currency?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          order_id: string
          client_id: string
          moyasar_payment_id: string | null
          moyasar_transaction_url: string | null
          amount: number
          currency: string
          payment_method: PaymentMethodType
          status: PaymentStatus
          card_last_four: string | null
          card_brand: string | null
          description: string | null
          callback_url: string | null
          metadata: Json | null
          authorized_at: string | null
          paid_at: string | null
          failed_at: string | null
          refunded_at: string | null
          failure_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          client_id: string
          moyasar_payment_id?: string | null
          moyasar_transaction_url?: string | null
          amount: number
          currency?: string
          payment_method: PaymentMethodType
          status?: PaymentStatus
          card_last_four?: string | null
          card_brand?: string | null
          description?: string | null
          callback_url?: string | null
          metadata?: Json | null
          authorized_at?: string | null
          paid_at?: string | null
          failed_at?: string | null
          refunded_at?: string | null
          failure_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          client_id?: string
          moyasar_payment_id?: string | null
          moyasar_transaction_url?: string | null
          amount?: number
          currency?: string
          payment_method?: PaymentMethodType
          status?: PaymentStatus
          card_last_four?: string | null
          card_brand?: string | null
          description?: string | null
          callback_url?: string | null
          metadata?: Json | null
          authorized_at?: string | null
          paid_at?: string | null
          failed_at?: string | null
          refunded_at?: string | null
          failure_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          order_id: string
          payment_id: string | null
          client_id: string
          supplier_id: string
          invoice_number: string
          subtotal: number
          tax_percent: number | null
          tax_amount: number
          discount_amount: number | null
          total_amount: number
          status: InvoiceStatus
          issue_date: string
          due_date: string
          paid_date: string | null
          notes: string | null
          terms: string | null
          pdf_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          payment_id?: string | null
          client_id: string
          supplier_id: string
          invoice_number: string
          subtotal: number
          tax_percent?: number | null
          tax_amount?: number
          discount_amount?: number | null
          total_amount: number
          status?: InvoiceStatus
          issue_date?: string
          due_date: string
          paid_date?: string | null
          notes?: string | null
          terms?: string | null
          pdf_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          payment_id?: string | null
          client_id?: string
          supplier_id?: string
          invoice_number?: string
          subtotal?: number
          tax_percent?: number | null
          tax_amount?: number
          discount_amount?: number | null
          total_amount?: number
          status?: InvoiceStatus
          issue_date?: string
          due_date?: string
          paid_date?: string | null
          notes?: string | null
          terms?: string | null
          pdf_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          id: string
          payment_id: string
          order_id: string
          moyasar_refund_id: string | null
          amount: number
          reason: string
          status: PaymentStatus
          processed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          order_id: string
          moyasar_refund_id?: string | null
          amount: number
          reason: string
          status?: PaymentStatus
          processed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          order_id?: string
          moyasar_refund_id?: string | null
          amount?: number
          reason?: string
          status?: PaymentStatus
          processed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: number
          auto_quote_delay_minutes: number
          default_margin_percent: number
          updated_at: string
        }
        Insert: {
          id?: number
          auto_quote_delay_minutes: number
          default_margin_percent: number
          updated_at?: string
        }
        Update: {
          id?: number
          auto_quote_delay_minutes?: number
          default_margin_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_client_credit_limit: {
        Args: {
          p_target_client_id: string
          p_adjustment_type: CreditLimitAdjustmentType
          p_adjustment_amount: number
          p_adjustment_reason: string
        }
        Returns: {
          id: string
          client_id: string
          admin_id: string
          adjustment_type: CreditLimitAdjustmentType
          adjustment_amount: number
          change_amount: number
          previous_limit: number
          new_limit: number
          reason: string
          created_at: string
        }[]
      }
      admin_update_user_sensitive_fields: {
        Args: {
          target_user_id: string
          new_role?: UserRole | null
          new_verified?: boolean | null
          new_status?: UserStatus | null
          new_kyc_status?: KycStatus | null
          new_rating?: number | null
          new_credit_limit?: number | null
        }
        Returns: boolean
      }
      generate_public_id: {
        Args: { prefix: string }
        Returns: string
      }
      accept_quote_and_deduct_credit: {
        Args: { p_quote_id: string }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      create_rfq_with_items: {
        Args: {
          p_client_id: string
          p_items: Json
          p_status?: string | null
          p_date?: string | null
        }
        Returns: Database['public']['Tables']['rfqs']['Row']
      }
      assign_custom_request: {
        Args: {
          p_request_id: string
          p_supplier_id: string
          p_notes?: string | null
        }
        Returns: Database['public']['Tables']['custom_item_requests']['Row']
      }
      get_client_request_summary: {
        Args: { p_client_id: string }
        Returns: Json
      }
      get_admin_dashboard_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      decrement_stock_atomic: {
        Args: {
          p_product_id: string
          p_quantity: number
        }
        Returns: {
          success: boolean
          previous_stock: number | null
          new_stock: number | null
          error: string | null
        }[]
      }
      verify_client_po_and_confirm_order: {
        Args: {
          p_document_id: string
        }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      mark_order_as_paid: {
        Args: {
          p_order_id: string
          p_admin_id?: string | null
          p_payment_reference?: string | null
          p_payment_notes?: string | null
        }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      reject_payment_submission: {
        Args: {
          p_order_id: string
          p_reason: string
        }
        Returns: Database['public']['Tables']['orders']['Row']
      }
    }
    Enums: {
      user_role: UserRole
      user_status: UserStatus
      kyc_status: KycStatus
      product_status: ProductStatus
      rfq_status: RfqStatus
      quote_status: QuoteStatus
      order_status: OrderStatus
      payment_status: PaymentStatus
      payment_method_type: PaymentMethodType
      invoice_status: InvoiceStatus
    }
  }
}
