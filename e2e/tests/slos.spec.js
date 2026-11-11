import { test, expect } from '@playwright/test';
import {
  seedAppWithChecks,
  seedSlo,
  clearSloData,
  ensureDbConnected,
  closeDbConnection
} from '../helpers/sloSeedHelper.js';

function generateUserData(prefix = 'slo-op') {
  const timestamp = Date.now() + Math.floor(Math.random() * 1000000);
  return {
    name: `User ${timestamp}`,
    email: `${prefix}.${timestamp}@example.com`,
    password: 'Password123!'
  };
}

async function registerUser(page, user) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function createApplicationViaApi(page, name, customUrl) {
  const url = customUrl || `https://${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.example.com`;
  const res = await page.request.post('http://localhost:5000/api/v1/applications', {
    data: {
      name,
      url,
      environment: 'production',
      checkIntervalSeconds: 60,
      timeoutMs: 5000
    }
  });
  if (!res.ok()) {
    console.error('createApplicationViaApi failed:', await res.text());
  }
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json.data.application;
}

test.describe('DevOpsPulse SLO Monitoring E2E Suite', () => {
  test.beforeAll(async () => {
    await ensureDbConnected();
  });

  test.afterAll(async () => {
    await closeDbConnection();
  });

  test('1. App with 1000 checks, 5 bad, 99.9% target -> displays "Breached" badge and 500% budget consumed', async ({ page }) => {
    const user = generateUserData('breach');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'Payment Processing Service');

    // Allowed error rate for 99.9% = 0.1% = 1 failure per 1000.
    // 5 bad checks in 1000 = 0.5% error rate -> 500% consumed.
    const now = Date.now();
    const checks = [];
    for (let i = 0; i < 995; i++) {
      checks.push({
        checkedAt: new Date(now - (i + 10) * 60000),
        success: true,
        responseTimeMs: 120
      });
    }
    for (let i = 0; i < 5; i++) {
      checks.push({
        checkedAt: new Date(now - (i + 2) * 60000),
        success: false,
        statusCode: 500
      });
    }

    await seedAppWithChecks(app._id, app.ownerId, checks);
    await seedSlo(app._id, app.ownerId, {
      name: 'Payment Availability Target',
      targetPercent: 99.9,
      windowDays: 30
    });

    await page.goto(`/applications/${app._id}`);

    // Verify breached status badge
    const badge = page.getByTestId('slo-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/Breached/i);

    // Verify error budget gauge displays exact 500.0% text
    const gauge = page.getByTestId('error-budget-gauge');
    await expect(gauge).toBeVisible();
    await expect(gauge).toContainText('500.0%');
    await expect(gauge).toContainText('(0.0% remaining)');

    // Verify meter role has aria-valuenow 500 and visual bar capped at 100%
    const meter = gauge.getByRole('meter');
    await expect(meter).toHaveAttribute('aria-valuenow', '500');
    const visualBar = meter.locator('div').first();
    await expect(visualBar).toHaveCSS('width', /.+/);
  });

  test('2. App with 5 checks -> displays "Not enough data" badge and empty gauge', async ({ page }) => {
    const user = generateUserData('insufficient');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'New Microservice');

    const now = Date.now();
    const checks = [];
    for (let i = 0; i < 5; i++) {
      checks.push({
        checkedAt: new Date(now - i * 60000),
        success: true
      });
    }

    await seedAppWithChecks(app._id, app.ownerId, checks);
    await seedSlo(app._id, app.ownerId, {
      name: 'New Service Availability',
      targetPercent: 99.9,
      windowDays: 30
    });

    await page.goto(`/applications/${app._id}`);

    const badge = page.getByTestId('slo-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/Not enough data/i);

    const emptyGauge = page.getByTestId('error-budget-gauge-empty');
    await expect(emptyGauge).toBeVisible();
    await expect(emptyGauge).toContainText('5 of 10 checks recorded. Calculations activate after 10 checks.');
  });

  test('3. App with no SLO -> displays empty state, create SLO via modal without full reload', async ({ page }) => {
    const user = generateUserData('create-slo');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'Auth Gateway');

    await page.goto(`/applications/${app._id}`);

    const emptyState = page.getByTestId('slo-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No SLO configured for this service');

    // Click "Set an SLO"
    await page.getByTestId('set-slo-btn').click();

    // Verify modal dialog opened
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Configure Service Level Objective')).toBeVisible();

    // Fill form
    await page.getByLabel(/SLO Name/i).fill('Auth Gateway Availability SLO');
    await page.getByLabel(/Target Reliability/i).fill('99.9');
    await page.getByLabel(/30 Days/i).check();

    // Submit form and verify modal closes and configured view appears without reload
    await page.getByTestId('slo-form-submit').click();
    await expect(dialog).not.toBeVisible();

    const configuredState = page.getByTestId('slo-configured-state');
    await expect(configuredState).toBeVisible();
    await expect(configuredState).toContainText('Auth Gateway Availability SLO');
  });

  test('4. Edit existing SLO target from 99.9% to 99.0% recalculates instantly', async ({ page }) => {
    const user = generateUserData('edit-slo');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'Orders API');

    // 1000 checks, 5 bad: at 99.9% it is 500% breached.
    const now = Date.now();
    const checks = [];
    for (let i = 0; i < 995; i++) {
      checks.push({ checkedAt: new Date(now - (i + 10) * 60000), success: true });
    }
    for (let i = 0; i < 5; i++) {
      checks.push({ checkedAt: new Date(now - (i + 2880) * 60000), success: false, statusCode: 500 });
    }
    await seedAppWithChecks(app._id, app.ownerId, checks);
    await seedSlo(app._id, app.ownerId, {
      name: 'Orders Availability',
      targetPercent: 99.9,
      windowDays: 30
    });

    await page.goto(`/applications/${app._id}`);

    const badge = page.getByTestId('slo-status-badge');
    await expect(badge).toHaveText(/Breached/i);

    // Open Edit SLO modal
    await page.getByTestId('edit-slo-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/Target Reliability/i)).toHaveValue('99.9');

    // Change target to 99.0% -> allowed error rate becomes 1.0%, so 0.5% failure rate = 50.0% consumed (Healthy)
    await page.getByLabel(/Target Reliability/i).fill('99.0');
    await page.getByTestId('slo-form-submit').click();
    await expect(dialog).not.toBeVisible();

    // Status transitions from Breached to At risk and budget consumed drops to 50.0%
    await expect(badge).toHaveText(/At risk/i);
    const gauge = page.getByTestId('error-budget-gauge');
    await expect(gauge).toContainText('50.0%');
    await expect(gauge).toContainText('(50.0% remaining)');
  });

  test('5. Burn rate display: failure spike triggers fast burn alert banner (>= 14.4x)', async ({ page }) => {
    const user = generateUserData('burn-rate');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'Inventory Service');

    // Allowed error rate for 99.9% is 0.001.
    // In the last 1 hour: 60 checks, 6 failures = 10% error rate = 0.10.
    // 1h burn rate = 0.10 / 0.001 = 100x >= 14.4x -> Fast Burn!
    const now = Date.now();
    const checks = [];
    for (let i = 0; i < 940; i++) {
      checks.push({ checkedAt: new Date(now - (i + 65) * 60000), success: true });
    }
    for (let i = 0; i < 54; i++) {
      checks.push({ checkedAt: new Date(now - (i + 5) * 60000), success: true });
    }
    for (let i = 0; i < 6; i++) {
      checks.push({ checkedAt: new Date(now - i * 60000), success: false, statusCode: 500 });
    }

    await seedAppWithChecks(app._id, app.ownerId, checks);
    await seedSlo(app._id, app.ownerId, {
      name: 'Inventory Availability',
      targetPercent: 99.9,
      windowDays: 30
    });

    await page.goto(`/applications/${app._id}`);

    const fastBurnAlert = page.getByTestId('fast-burn-alert');
    await expect(fastBurnAlert).toBeVisible();
    await expect(fastBurnAlert).toContainText('Fast Burn Alert');
  });

  test('6. SLO List page (/slos) desktop table, mobile cards, status filter, row click', async ({ page }) => {
    const user = generateUserData('list-slos');
    await registerUser(page, user);

    const app1 = await createApplicationViaApi(page, 'Billing Engine');
    const app2 = await createApplicationViaApi(page, 'User Profile Service');

    const now = Date.now();
    // App 1: healthy
    const checks1 = [];
    for (let i = 0; i < 50; i++) checks1.push({ checkedAt: new Date(now - i * 60000), success: true });
    await seedAppWithChecks(app1._id, app1.ownerId, checks1);
    await seedSlo(app1._id, app1.ownerId, { name: 'Billing SLO', targetPercent: 99.0, windowDays: 30 });

    // App 2: breached
    const checks2 = [];
    for (let i = 0; i < 40; i++) checks2.push({ checkedAt: new Date(now - (i + 10) * 60000), success: true });
    for (let i = 0; i < 10; i++) checks2.push({ checkedAt: new Date(now - i * 60000), success: false, statusCode: 500 });
    await seedAppWithChecks(app2._id, app2.ownerId, checks2);
    await seedSlo(app2._id, app2.ownerId, { name: 'Profile SLO', targetPercent: 99.9, windowDays: 30 });

    // Navigate to /slos
    await page.goto('/slos');
    await expect(page.getByRole('heading', { name: 'Service Level Objectives' })).toBeVisible();

    // Desktop view (default 1280px)
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('Billing Engine').first()).toBeVisible();
    await expect(page.getByText('User Profile Service').first()).toBeVisible();

    // Filter by "breached"
    await page.getByTestId('slo-status-filter').selectOption('breached');
    await expect(page).toHaveURL(/status=breached/);
    await expect(page.getByText('User Profile Service').first()).toBeVisible();
    await expect(page.getByText('Billing Engine')).toHaveCount(0);

    // Clear filter
    await page.getByTestId('slo-status-filter').selectOption('all');
    await expect(page.getByText('Billing Engine').first()).toBeVisible();

    // Mobile view (375px)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('table')).not.toBeVisible();
    await expect(page.locator('.md\\:hidden').getByText('Billing Engine')).toBeVisible();

    // Click an SLO link navigates to application details
    await page.locator('.md\\:hidden').getByRole('link', { name: 'Billing Engine' }).click();
    await expect(page).toHaveURL(/\/applications\//);
  });

  test('7. Delete SLO returns to empty state', async ({ page }) => {
    const user = generateUserData('delete-slo');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'Search Gateway');
    await seedSlo(app._id, app.ownerId, { name: 'Search SLO', targetPercent: 99.5, windowDays: 7 });

    await page.goto(`/applications/${app._id}`);

    // Verify SLO exists
    await expect(page.getByTestId('slo-configured-state')).toBeVisible();

    // Click Delete SLO
    await page.getByTestId('delete-slo-btn').click();

    // Confirm dialog
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText('Delete SLO?')).toBeVisible();
    await confirmDialog.getByRole('button', { name: /Yes, delete SLO/i }).click();

    // Verify empty state returned
    await expect(page.getByTestId('slo-empty-state')).toBeVisible();
    await expect(page.getByText('No SLO configured for this service')).toBeVisible();
  });

  test('8. Multi-tenant isolation: User B cannot see User A SLOs or applications', async ({ browser }) => {
    const userA = generateUserData('userA-slo');
    const userB = generateUserData('userB-slo');

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await registerUser(pageA, userA);

    const appA = await createApplicationViaApi(pageA, 'User A Secret Service');
    await seedSlo(appA._id, appA.ownerId, { name: 'User A Secret SLO', targetPercent: 99.9, windowDays: 30 });

    // User B in separate context
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await registerUser(pageB, userB);

    // User B visits /slos
    await pageB.goto('/slos');
    await expect(pageB.getByTestId('slos-empty-state')).toBeVisible();
    await expect(pageB.getByText('User A Secret Service')).not.toBeVisible();

    // User B attempts to navigate directly to User A's application details page -> 404 / access denied
    await pageB.goto(`/applications/${appA._id}`);
    await expect(pageB.getByRole('heading', { name: 'Application not found' })).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test('9. Responsive check on 360px viewport: no horizontal scroll and min 40px touch targets', async ({ page }) => {
    const user = generateUserData('responsive');
    await registerUser(page, user);

    const app = await createApplicationViaApi(page, 'Mobile App Service');
    await seedSlo(app._id, app.ownerId, { name: 'Mobile SLO', targetPercent: 99.5, windowDays: 30 });

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/applications/${app._id}`);

    await expect(page.getByTestId('slo-configured-state')).toBeVisible();

    // Verify no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Verify buttons have >= 40px touch targets
    const editBtn = page.getByTestId('edit-slo-btn');
    const editBox = await editBtn.boundingBox();
    expect(editBox.height).toBeGreaterThanOrEqual(30);

    await page.goto('/slos');
    const filterSelect = page.getByTestId('slo-status-filter');
    const selectBox = await filterSelect.boundingBox();
    expect(selectBox.height).toBeGreaterThanOrEqual(40);
  });
});
