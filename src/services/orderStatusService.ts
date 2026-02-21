import { OrderStatus } from '../types/types';

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_ADMIN_CONFIRMATION]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CONFIRMATION, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PENDING_ADMIN_CONFIRMATION, OrderStatus.AWAITING_CONFIRMATION, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.AWAITING_CONFIRMATION]: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_CONFIRMED]: [
    OrderStatus.PROCESSING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.PICKUP_SCHEDULED,
    OrderStatus.PICKED_UP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PROCESSING]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.PICKUP_SCHEDULED,
    OrderStatus.PICKED_UP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.PICKUP_SCHEDULED, OrderStatus.PICKED_UP, OrderStatus.CANCELLED],
  [OrderStatus.PICKUP_SCHEDULED]: [OrderStatus.PICKED_UP, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
  [OrderStatus.PICKED_UP]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED, OrderStatus.DISPUTED, OrderStatus.REFUNDED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.DISPUTED]: [OrderStatus.REFUNDED, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

export function canTransitionOrderStatus(
  currentStatus: OrderStatus | string,
  nextStatus: OrderStatus | string
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  const transitions = ORDER_STATUS_TRANSITIONS[currentStatus as OrderStatus];
  if (!transitions) {
    return false;
  }

  return transitions.includes(nextStatus as OrderStatus);
}

export function getAllowedOrderStatusTransitions(currentStatus: OrderStatus | string): OrderStatus[] {
  const transitions = ORDER_STATUS_TRANSITIONS[currentStatus as OrderStatus];
  return transitions ? [...transitions] : [];
}
