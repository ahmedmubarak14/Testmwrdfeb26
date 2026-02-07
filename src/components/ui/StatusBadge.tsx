import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Truck,
  Package,
  FileText,
  Send,
  Eye,
  Ban
} from 'lucide-react';
import { cn } from '../../utils/helpers';

export type BadgeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'open'
  | 'quoted'
  | 'closed'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'processing'
  | 'confirmed'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending_payment'
  | 'awaiting_confirmation'
  | 'payment_confirmed'
  | 'accepted'
  | 'active'
  | 'deactivated'
  | 'requires_attention'
  | 'verified'
  | 'in_review'
  | 'incomplete'
  | 'ready_for_pickup'
  | 'pickup_scheduled'
  | 'out_for_delivery'
  | 'shipped';

interface StatusBadgeProps {
  status: BadgeStatus | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className
}) => {
  const { t } = useTranslation();

  const normalizedStatus = status.toLowerCase().replace(/[\s_]+/g, '_') as BadgeStatus;

  const getConfig = () => {
    switch (normalizedStatus) {
      case 'pending':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: <Clock className="w-3 h-3" />,
          label: t('common.pending', 'Pending')
        };
      case 'approved':
      case 'confirmed':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('common.approved', 'Approved')
        };
      case 'rejected':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: <XCircle className="w-3 h-3" />,
          label: t('common.rejected', 'Rejected')
        };
      case 'open':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: <FileText className="w-3 h-3" />,
          label: t('status.open', 'Open')
        };
      case 'quoted':
        return {
          bg: 'bg-purple-50',
          border: 'border-purple-200',
          text: 'text-purple-700',
          icon: <Send className="w-3 h-3" />,
          label: t('status.quoted', 'Quoted')
        };
      case 'closed':
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: <Ban className="w-3 h-3" />,
          label: t('status.closed', 'Closed')
        };
      case 'processing': // This case already exists, but the instruction snippet had it. Keeping the existing one.
        return {
          bg: 'bg-blue-100',
          border: 'border-blue-200',
          text: 'text-blue-800',
          icon: <Clock className="w-3 h-3" />, // Assuming Clock for processing
          label: t('status.processing', 'Processing')
        };
      case 'ready_for_pickup':
        return {
          bg: 'bg-indigo-100',
          border: 'border-indigo-200',
          text: 'text-indigo-800',
          icon: <Package className="w-3 h-3" />, // Assuming Package for ready for pickup
          label: t('status.readyForPickup', 'Ready for Pickup')
        };
      case 'pickup_scheduled':
        return {
          bg: 'bg-purple-100',
          border: 'border-purple-200',
          text: 'text-purple-800',
          icon: <Clock className="w-3 h-3" />, // Assuming Clock for scheduled
          label: t('status.pickupScheduled', 'Pickup Scheduled')
        };
      case 'shipped':
      case 'in_transit':
      case 'out_for_delivery':
        return {
          bg: 'bg-orange-100',
          border: 'border-orange-200',
          text: 'text-orange-800',
          icon: <Truck className="w-3 h-3" />, // Assuming Truck for transit/delivery
          label: t('status.inTransit', 'In Transit')
        };
      case 'delivered':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <Package className="w-3 h-3" />,
          label: t('status.delivered', 'Delivered')
        };
      case 'cancelled':
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: <XCircle className="w-3 h-3" />,
          label: t('status.cancelled', 'Cancelled')
        };
      case 'draft':
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          text: 'text-slate-600',
          icon: <FileText className="w-3 h-3" />,
          label: t('status.draft', 'Draft')
        };
      case 'submitted':
        return {
          bg: 'bg-indigo-50',
          border: 'border-indigo-200',
          text: 'text-indigo-700',
          icon: <Send className="w-3 h-3" />,
          label: t('status.submitted', 'Submitted')
        };
      case 'under_review':
      case 'in_review':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-700',
          icon: <Eye className="w-3 h-3" />,
          label: t('status.underReview', 'Under Review')
        };
      case 'pending_payment':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-700',
          icon: <Clock className="w-3 h-3" />,
          label: t('status.pendingpayment', 'Pending Payment')
        };
      case 'awaiting_confirmation':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: <Clock className="w-3 h-3" />,
          label: t('status.awaitingconfirmation', 'Awaiting Confirmation')
        };
      case 'payment_confirmed':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('status.paymentconfirmed', 'Payment Confirmed')
        };
      case 'accepted':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('status.accepted', 'Accepted')
        };
      case 'active':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('admin.users.active', 'Active')
        };
      case 'deactivated':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: <Ban className="w-3 h-3" />,
          label: t('admin.users.deactivated', 'Deactivated')
        };
      case 'requires_attention':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          text: 'text-orange-700',
          icon: <AlertCircle className="w-3 h-3" />,
          label: t('admin.users.requiresAttention', 'Requires Attention')
        };
      case 'verified':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('admin.users.verified', 'Verified')
        };
      case 'incomplete':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: <AlertCircle className="w-3 h-3" />,
          label: t('admin.users.incomplete', 'Incomplete')
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: <AlertCircle className="w-3 h-3" />,
          label: status
        };
    }
  };

  const config = getConfig();

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        config.bg,
        config.border,
        config.text,
        sizeStyles[size],
        className
      )}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
};
