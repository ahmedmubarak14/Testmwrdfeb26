import { describe, expect, it } from 'vitest';
import { canTransitionPaymentStatus } from './paymentService';
import { PaymentStatus } from '../types/payment';

describe('canTransitionPaymentStatus', () => {
  it('allows status to remain unchanged', () => {
    expect(
      canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.PENDING)
    ).toBe(true);
  });

  it('allows valid forward transitions', () => {
    expect(
      canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.PAID)
    ).toBe(true);
    expect(
      canTransitionPaymentStatus(PaymentStatus.PAID, PaymentStatus.REFUNDED)
    ).toBe(true);
  });

  it('blocks invalid reverse transitions', () => {
    expect(
      canTransitionPaymentStatus(PaymentStatus.PAID, PaymentStatus.PENDING)
    ).toBe(false);
    expect(
      canTransitionPaymentStatus(PaymentStatus.REFUNDED, PaymentStatus.PAID)
    ).toBe(false);
  });

  it('blocks transitions out of terminal states', () => {
    expect(
      canTransitionPaymentStatus(PaymentStatus.CANCELLED, PaymentStatus.PAID)
    ).toBe(false);
    expect(
      canTransitionPaymentStatus(PaymentStatus.FAILED, PaymentStatus.AUTHORIZED)
    ).toBe(false);
  });
});

