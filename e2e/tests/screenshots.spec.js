import { test, expect } from '@playwright/test';
import {
  seedAppWithChecks,
  seedSlo,
  ensureDbConnected,
  closeDbConnection
} from '../helpers/sloSeedHelper.js';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.resolve(process.cwd(), '..', 'docs', 'screenshots');

function generateUserData(prefix = 'shot') {
  const timestamp = Date.now() + Math.floor(Math.random() * 1000000);
  return {
    name: `Shot User ${timestamp}`,
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

async function createApplicationViaApi(page, name) {
  const url = `https://${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.example.com`;
  const res = await page.request.post('http://localhost:5000/api/v1/applications', {
    data: {
      name,
      url,
      environment: 'production',
      checkIntervalSeconds: 60,
      timeoutMs: 5000
    }
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json.data.application;
}

test.describe('Generate SLO Documentation Screenshots', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await ensureDbConnected();
  });

  test.afterAll(async () => {
    await closeDbConnection();
  });

  test('Capture SLO Section states and SLO List views', async ({ page }) => {
    const user = generateUserData('screens');
    await registerUser(page, user);

    // 1. Healthy App (99.0% target, 1000 checks, 2 bad -> 20% budget consumed)
    const healthyApp = await createApplicationViaApi(page, 'Checkout Service');
    const now = Date.now();
    const healthyChecks = [];
    for (let i = 0; i < 998; i++) {
      healthyChecks.push({
        checkedAt: new Date(now - (i + 10) * 60000),
        success: true,
        responseTimeMs: 95
      });
    }
    for (let i = 0; i < 2; i++) {
      healthyChecks.push({
        checkedAt: new Date(now - (i + 2) * 60000),
        success: false,
        responseTimeMs: 500,
        statusCode: 500
      });
    }
    await seedAppWithChecks(healthyApp._id, healthyApp.ownerId, healthyChecks);
    await seedSlo(healthyApp._id, healthyApp.ownerId, { targetPercent: 99.0, windowDays: 7 });

    await page.goto(`/applications/${healthyApp._id}`);
    const sloSection = page.getByTestId('slo-section');
    await expect(sloSection).toBeVisible();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await sloSection.screenshot({
      path: path.join(screenshotDir, 'slo-section-healthy.png')
    });

    // 2. At risk App (99.0% target, 1000 checks, 6 bad -> 60% budget consumed)
    const atRiskApp = await createApplicationViaApi(page, 'Authentication API');
    const atRiskChecks = [];
    for (let i = 0; i < 994; i++) {
      atRiskChecks.push({
        checkedAt: new Date(now - (i + 10) * 60000),
        success: true,
        responseTimeMs: 110
      });
    }
    for (let i = 0; i < 6; i++) {
      atRiskChecks.push({
        checkedAt: new Date(now - (i + 2) * 60000),
        success: false,
        responseTimeMs: 500,
        statusCode: 503
      });
    }
    await seedAppWithChecks(atRiskApp._id, atRiskApp.ownerId, atRiskChecks);
    await seedSlo(atRiskApp._id, atRiskApp.ownerId, { targetPercent: 99.0, windowDays: 7 });

    await page.goto(`/applications/${atRiskApp._id}`);
    await expect(page.getByTestId('slo-section')).toBeVisible();
    await expect(page.getByText('At risk', { exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByTestId('slo-section').screenshot({
      path: path.join(screenshotDir, 'slo-section-at-risk.png')
    });

    // 3. Breached App (99.9% target, 1000 checks, 5 bad + recent burst -> 500% consumed + fast burn alert)
    const breachedApp = await createApplicationViaApi(page, 'Payment Gateway');
    const breachedChecks = [];
    for (let i = 0; i < 980; i++) {
      breachedChecks.push({
        checkedAt: new Date(now - (i + 40) * 60000),
        success: true,
        responseTimeMs: 140
      });
    }
    for (let i = 0; i < 20; i++) {
      breachedChecks.push({
        checkedAt: new Date(now - (i + 2) * 60000),
        success: false,
        responseTimeMs: 600,
        statusCode: 500
      });
    }
    await seedAppWithChecks(breachedApp._id, breachedApp.ownerId, breachedChecks);
    await seedSlo(breachedApp._id, breachedApp.ownerId, { targetPercent: 99.9, windowDays: 7 });

    await page.goto(`/applications/${breachedApp._id}`);
    await expect(page.getByTestId('slo-section')).toBeVisible();
    await expect(page.getByText('Breached', { exact: true })).toBeVisible();
    await expect(page.getByText('Fast Burn Alert')).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByTestId('slo-section').screenshot({
      path: path.join(screenshotDir, 'slo-section-breached.png')
    });

    // 4. Insufficient data App (<10 checks)
    const newApp = await createApplicationViaApi(page, 'Analytics Worker');
    const fewChecks = [];
    for (let i = 0; i < 5; i++) {
      fewChecks.push({
        checkedAt: new Date(now - (i + 2) * 60000),
        success: true,
        responseTimeMs: 80
      });
    }
    await seedAppWithChecks(newApp._id, newApp.ownerId, fewChecks);
    await seedSlo(newApp._id, newApp.ownerId, { targetPercent: 99.5, windowDays: 7 });

    await page.goto(`/applications/${newApp._id}`);
    await expect(page.getByTestId('slo-section')).toBeVisible();
    await expect(page.getByTestId('slo-status-badge').getByText('Not enough data')).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByTestId('slo-section').screenshot({
      path: path.join(screenshotDir, 'slo-section-insufficient.png')
    });

    // 5. Desktop SLO List Page
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/slos');
    await expect(page.getByRole('heading', { name: 'Service Level Objectives' })).toBeVisible();
    await expect(page.getByText('Checkout Service').first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(screenshotDir, 'slo-list-desktop.png'),
      fullPage: true
    });

    // 6. Mobile SLO List Page
    await page.setViewportSize({ width: 375, height: 750 });
    await page.goto('/slos');
    await expect(page.getByRole('heading', { name: 'Service Level Objectives' })).toBeVisible();
    await expect(page.locator('.md\\:hidden').getByText('Checkout Service')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(screenshotDir, 'slo-list-mobile.png'),
      fullPage: true
    });
  });
});
