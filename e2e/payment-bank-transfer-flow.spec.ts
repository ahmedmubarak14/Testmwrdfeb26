import { expect, Page, test } from '@playwright/test';

type Role = 'ADMIN' | 'CLIENT';

type Credentials = {
  email: string;
  password: string;
};

const getCredentials = (role: Role): Credentials | null => {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];

  if (!email || !password) {
    return null;
  }

  return { email, password };
};

const openLogin = async (page: Page) => {
  await page.goto('/');

  const topLoginButton = page.getByTestId('landing-login-button');
  if (await topLoginButton.isVisible()) {
    await topLoginButton.click();
    return;
  }

  await page.getByTestId('landing-hero-login-button').click();
};

const loginAs = async (page: Page, creds: Credentials) => {
  await openLogin(page);
  await page.getByTestId('login-email-input').fill(creds.email);
  await page.getByTestId('login-password-input').fill(creds.password);
  await page.getByTestId('login-submit-button').click();
};

test.describe('Bank transfer payment flow', () => {
  test('client can submit bank transfer reference from order details', async ({ page }) => {
    const creds = getCredentials('CLIENT');
    test.skip(!creds, 'Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD to run this test');

    await loginAs(page, creds!);
    await page.getByTestId('sidebar-nav-orders').click();
    await expect(page.getByTestId('client-orders-view')).toBeVisible();

    const detailsButtons = page.getByTestId('client-orders-view-details-button');
    if ((await detailsButtons.count()) === 0) {
      test.skip(true, 'No client orders available for payment submission');
    }

    await detailsButtons.first().click();

    const referenceInput = page.getByTestId('payment-reference-input');
    if (!(await referenceInput.isVisible())) {
      test.skip(true, 'No pending payment order available for bank transfer submission');
    }

    const reference = `E2E-${Date.now()}`;
    await referenceInput.fill(reference);
    await page.getByTestId('payment-reference-submit').click();

    await expect(page.locator('body')).toContainText(
      /AWAITING_CONFIRMATION|Awaiting Confirmation|في انتظار التأكيد/
    );
  });

  test('admin can review and confirm a bank transfer payment', async ({ page }) => {
    const creds = getCredentials('ADMIN');
    test.skip(!creds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test');

    await loginAs(page, creds!);
    await page.getByTestId('sidebar-nav-orders').click();
    await expect(page.getByTestId('admin-orders-view')).toBeVisible();

    const reviewButtons = page.getByTestId('admin-orders-review-payment-button');
    if ((await reviewButtons.count()) === 0) {
      test.skip(true, 'No pending payment orders available for admin review');
    }

    await reviewButtons.first().click();

    const reviewReferenceInput = page.getByTestId('admin-orders-review-payment-reference-input');
    const currentValue = await reviewReferenceInput.inputValue();
    if (!currentValue.trim()) {
      await reviewReferenceInput.fill(`ADMIN-E2E-${Date.now()}`);
    }

    const notesField = page.getByTestId('admin-orders-review-payment-notes-input');
    await notesField.fill('E2E admin confirmation for bank transfer');

    await page.getByTestId('admin-orders-confirm-payment-button').click();
    await expect(page.getByTestId('admin-orders-confirm-payment-button')).toHaveCount(0);
  });

  test('admin can reject an awaiting bank transfer submission', async ({ page }) => {
    const creds = getCredentials('ADMIN');
    test.skip(!creds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test');

    await loginAs(page, creds!);
    await page.getByTestId('sidebar-nav-orders').click();
    await expect(page.getByTestId('admin-orders-view')).toBeVisible();

    const statusFilter = page.getByTestId('admin-orders-status-filter');
    await statusFilter.selectOption('AWAITING_CONFIRMATION');

    const reviewButtons = page.getByTestId('admin-orders-review-payment-button');
    if ((await reviewButtons.count()) === 0) {
      test.skip(true, 'No awaiting confirmation orders available for rejection');
    }

    await reviewButtons.first().click();
    await page.getByTestId('admin-orders-review-payment-notes-input').fill('E2E rejection: reference could not be verified');
    await page.getByTestId('admin-orders-reject-payment-button').click();

    await expect(page.getByTestId('admin-orders-reject-payment-button')).toHaveCount(0);
  });
});
