import { OrderStatus } from '../types/types';

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PO]: [OrderStatus.CONFIRMED, OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PENDING_PO, OrderStatus.AWAITING_CONFIRMATION, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.AWAITING_CONFIRMATION]: [OrderStatus.PENDING_PO, OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_CONFIRMED]: [
    OrderStatus.PROCESSING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.PICKUP_SCHEDULED,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.IN_TRANSIT,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PROCESSING]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.PICKUP_SCHEDULED,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.IN_TRANSIT,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.PICKUP_SCHEDULED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.PICKUP_SCHEDULED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
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
