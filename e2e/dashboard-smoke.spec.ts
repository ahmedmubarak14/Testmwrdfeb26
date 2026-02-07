import { expect, Page, test } from '@playwright/test';

type Role = 'ADMIN' | 'CLIENT' | 'SUPPLIER';

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

test.describe('Dashboard button smoke suite', () => {
  test('admin quick actions route to target tabs', async ({ page }) => {
    const creds = getCredentials('ADMIN');
    test.skip(!creds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test');

    await loginAs(page, creds!);
    await expect(page.getByTestId('admin-overview-view')).toBeVisible();

    await page.getByTestId('admin-overview-quick-users').click();
    await expect(page.getByTestId('admin-users-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-overview').click();
    await expect(page.getByTestId('admin-overview-view')).toBeVisible();

    await page.getByTestId('admin-overview-quick-approvals').click();
    await expect(page.getByTestId('admin-approvals-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-overview').click();
    await expect(page.getByTestId('admin-overview-view')).toBeVisible();

    await page.getByTestId('admin-overview-quick-margins').click();
    await expect(page.getByTestId('admin-margins-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-overview').click();
    await expect(page.getByTestId('admin-overview-view')).toBeVisible();

    await page.getByTestId('admin-overview-quick-orders').click();
    await expect(page.getByTestId('admin-orders-view')).toBeVisible();
  });

  test('client dashboard actions route to browse, RFQ, and orders', async ({ page }) => {
    const creds = getCredentials('CLIENT');
    test.skip(!creds, 'Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD to run this test');

    await loginAs(page, creds!);
    await expect(page.getByTestId('client-dashboard-view')).toBeVisible();

    await page.getByTestId('client-dashboard-browse-button').click();
    await expect(page.getByTestId('client-browse-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-dashboard').click();
    await expect(page.getByTestId('client-dashboard-view')).toBeVisible();

    await page.getByTestId('client-dashboard-create-rfq-button').click();
    await expect(page.getByTestId('client-create-rfq-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-dashboard').click();
    await expect(page.getByTestId('client-dashboard-view')).toBeVisible();

    await page.getByTestId('client-dashboard-view-all-rfqs-button').click();
    await expect(page.getByTestId('client-rfqs-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-dashboard').click();
    await expect(page.getByTestId('client-dashboard-view')).toBeVisible();

    await page.getByTestId('client-dashboard-view-all-orders-button').click();
    await expect(page.getByTestId('client-orders-view')).toBeVisible();
  });

  test('supplier dashboard actions route to requests, quotes, and products', async ({ page }) => {
    const creds = getCredentials('SUPPLIER');
    test.skip(!creds, 'Set E2E_SUPPLIER_EMAIL and E2E_SUPPLIER_PASSWORD to run this test');

    await loginAs(page, creds!);
    await expect(page.getByTestId('supplier-dashboard-view')).toBeVisible();

    await page.getByTestId('supplier-dashboard-view-rfqs-button').click();
    await expect(page.getByTestId('supplier-requests-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-dashboard').click();
    await expect(page.getByTestId('supplier-dashboard-view')).toBeVisible();

    await page.getByTestId('supplier-dashboard-view-quotes-button').click();
    await expect(page.getByTestId('supplier-quotes-view')).toBeVisible();

    await page.getByTestId('sidebar-nav-dashboard').click();
    await expect(page.getByTestId('supplier-dashboard-view')).toBeVisible();

    await page.getByTestId('supplier-dashboard-view-catalog-button').click();
    await expect(page.getByTestId('supplier-products-view')).toBeVisible();
  });
});
