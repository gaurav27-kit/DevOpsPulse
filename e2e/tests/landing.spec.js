import { test, expect } from '@playwright/test';

test.describe('DevOpsPulse Public Landing Page E2E Suite', () => {
  const timestamp = Date.now();
  const testUser = {
    name: `Landing Tester ${timestamp}`,
    email: `landing.${timestamp}@example.com`,
    password: 'Password123!'
  };

  test('visitor sees hero with single h1, status card, and navigates to auth screens', async ({ page }) => {
    await page.goto('/');

    // Title verification
    await expect(page).toHaveTitle(/DevOpsPulse/i);

    // Single h1 heading presence
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    const h1Text = await page.locator('h1').textContent();
    expect(h1Text).toContain('Production Uptime Monitoring');
    expect(h1Text).toContain('Engineered for Resilient SRE Teams');

    // Central live status card
    await expect(page.getByText('api.production.internal')).toBeVisible();
    await expect(page.getByText('Status: Up')).toBeVisible();
    await expect(page.getByText('99.98%')).toBeVisible();

    // Verify sections exist
    await expect(page.locator('#features')).toBeVisible();
    await expect(page.locator('#how-it-works')).toBeVisible();
    await expect(page.locator('#security')).toBeVisible();
    await expect(page.locator('#contact')).toBeVisible();

    // Desktop nav "Sign in" navigates to /login
    const navSignIn = page.getByRole('link', { name: /^Sign in$/i }).first();
    await navSignIn.click();
    await expect(page).toHaveURL(/\/login/);

    // Return to / and click "Get started free" in hero
    await page.goto('/');
    const heroRegister = page.locator('#main-content').getByRole('link', { name: /Get started free/i });
    await heroRegister.click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('authenticated user sees Open dashboard CTA when visiting landing page', async ({ page }) => {
    // 1. Register a new user
    await page.goto('/register');
    await page.getByLabel('Full name').fill(testUser.name);
    await page.getByLabel('Email address').fill(testUser.email);
    await page.getByLabel('Password').fill(testUser.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Arrive on dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Visit landing page / while authenticated
    await page.goto('/');

    // Should see "Open dashboard" and NOT "Get started free"
    await expect(page.getByRole('link', { name: /Open dashboard/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Get started free/i })).toHaveCount(0);

    // Clicking "Open dashboard" brings back to /dashboard
    await page.getByRole('link', { name: /Open dashboard/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('submits contact form and verifies success feedback banner', async ({ page }) => {
    await page.goto('/#contact');

    // Fill in contact form fields
    await page.getByLabel(/Full Name/i).fill('Ada Lovelace');
    await page.getByLabel(/Work Email/i).fill('ada@example.org');
    await page.getByLabel(/Message/i).fill('Evaluating DevOpsPulse for mission-critical microservice observability.');

    // Submit
    await page.getByRole('button', { name: /Send Message/i }).click();

    // Expect success alert
    const successAlert = page.getByRole('alert');
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText('Thank you for reaching out!');

    // Fields should be reset
    await expect(page.getByLabel(/Full Name/i)).toHaveValue('');
    await expect(page.getByLabel(/Work Email/i)).toHaveValue('');
    await expect(page.getByLabel(/Message/i)).toHaveValue('');
  });

  test('mobile viewport (360px) has zero horizontal scroll and functional drawer menu', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');

    // Verify zero horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Open mobile menu
    const menuButton = page.getByRole('button', { name: /Toggle navigation menu/i });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Verify dialog is opened
    const mobileDialog = page.getByRole('dialog', { name: /Mobile Navigation/i });
    await expect(mobileDialog).toBeVisible();

    // Close dialog via toggle button
    await menuButton.click();
    await expect(mobileDialog).not.toBeVisible();
  });

  test('keyboard skip link focuses main content', async ({ page }) => {
    await page.goto('/');

    // Press Tab to focus skip link
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /Skip to main content/i });
    await expect(skipLink).toBeFocused();

    // Activate skip link
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
