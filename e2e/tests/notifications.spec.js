import { test, expect } from '@playwright/test';

function generateUserData(prefix = 'notifier') {
  const timestamp = Date.now() + Math.floor(Math.random() * 10000);
  return {
    name: `User ${timestamp}`,
    email: `${prefix}.${timestamp}@example.com`,
    password: 'ValidPassword123!'
  };
}

async function registerAndGoToNotifications(page, user) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Alerts' }).click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByRole('heading', { name: 'Notification Channels' })).toBeVisible();
}

test.describe('DevOpsPulse Notification Channels & Alerts Suite', () => {

  test('1. Notification channels CRUD & SSRF validation', async ({ page }) => {
    const user = generateUserData('crud');
    await registerAndGoToNotifications(page, user);

    // 1. SSRF Rejection: Attempt to add http://127.0.0.1:8080 webhook
    await page.getByRole('button', { name: 'Add Channel' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Channel Name').fill('SSRF Private Webhook');
    await page.getByLabel('Webhook URL').fill('http://127.0.0.1:8080/hook');
    await page.getByRole('button', { name: 'Create Channel' }).click();

    // Verify rejection message under the URL field
    await expect(page.locator('#channel-url-error')).toBeVisible();
    await expect(page.locator('#channel-url-error')).toHaveText(/private or local IP addresses are not permitted/i);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 2. Create an email channel: server reports "Email is not configured" (or creates if configured)
    await page.getByRole('button', { name: 'Add Channel' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Channel Name').fill('DevOps Email Channel');
    await page.getByRole('button', { name: /Email/i }).click();
    await page.getByRole('button', { name: 'Create Channel' }).click();

    const emailNotice = page.getByText(/Email is not configured on this server|Notification channel created successfully/i);
    await expect(emailNotice).toBeVisible();
    if (await page.getByRole('dialog').isVisible()) {
      await page.keyboard.press('Escape');
    }

    // 3. Create a valid Webhook Channel
    await page.getByRole('button', { name: 'Add Channel' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#channel-name').fill('Ops Webhook Channel');
    await page.locator('#channel-url').fill('https://example.com/api/webhooks/ops');

    const [createChanResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/notifications/channels') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create Channel' }).click()
    ]);
    const chanResJson = await createChanResponse.json();
    const createdChannelId = chanResJson.data.channel._id || chanResJson.data.channel.id;

    // Dismiss secret dialog
    await page.locator('#confirm-secret-saved').check();
    await page.getByRole('button', { name: 'I have saved it' }).click();

    // 4. Toggle enabled
    const toggleBtn = page.getByRole('button', { name: 'Toggle enabled for Ops Webhook Channel' });
    await expect(toggleBtn).toHaveText('Enabled');
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Disabled');
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Enabled');

    // 5. Edit channel
    await page.getByRole('button', { name: 'Edit Ops Webhook Channel' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Channel Name').fill('Ops Webhook Renamed');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Ops Webhook Renamed')).toBeVisible();

    // 6. Send test and see result inline
    await page.getByRole('button', { name: 'Send test notification to Ops Webhook Renamed' }).click();
    await expect(page.locator('[data-testid^="test-result-"]')).toBeVisible();
    await expect(page.locator('[data-testid="delivery-row"]').first()).toBeVisible();
    await expect(page.getByText('test').first()).toBeVisible();

    // 7. Delete channel through confirm dialog
    await page.getByRole('button', { name: 'Delete Ops Webhook Renamed' }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await page.getByRole('button', { name: 'Delete channel' }).click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.locator(`[data-testid="channel-row-${createdChannelId}"]`)).not.toBeVisible();

    // If the email channel was successfully created (SMTP configured environment), delete it too to verify empty state
    const emailDeleteBtn = page.getByRole('button', { name: 'Delete DevOps Email Channel' });
    if (await emailDeleteBtn.isVisible()) {
      await emailDeleteBtn.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete channel' }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }

    await expect(page.getByText('No notification channels configured')).toBeVisible();
  });

  test('2. Webhook signing secret dialog lifecycle and storage absence', async ({ page }) => {
    const user = generateUserData('secret');
    await registerAndGoToNotifications(page, user);

    await page.getByRole('button', { name: 'Add Channel' }).click();
    await page.getByLabel('Channel Name').fill('Secret Test Webhook');
    await page.getByLabel('Webhook URL').fill('https://example.com/api/webhooks/secret-test');
    await page.getByRole('button', { name: 'Create Channel' }).click();

    // Signing secret dialog appears ONCE
    const secretDialog = page.getByRole('dialog');
    await expect(secretDialog).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Webhook Signing Secret' })).toBeVisible();

    const secretInput = page.locator('#signing-secret-input');
    const secretVal = await secretInput.inputValue();
    expect(secretVal).toBeTruthy();
    expect(secretVal.length).toBe(64);

    // Confirm button requires "I have saved it" checkbox
    const confirmBtn = page.getByRole('button', { name: 'I have saved it' });
    await expect(confirmBtn).toBeDisabled();

    await page.locator('#confirm-secret-saved').check();
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();
    await expect(secretDialog).not.toBeVisible();

    // Assert secret string is not in DOM or localStorage/sessionStorage
    const domContent = await page.content();
    expect(domContent.includes(secretVal)).toBe(false);

    const storageSecrets = await page.evaluate((sec) => {
      const local = JSON.stringify(localStorage);
      const session = JSON.stringify(sessionStorage);
      return local.includes(sec) || session.includes(sec);
    }, secretVal);
    expect(storageSecrets).toBe(false);
  });

  test('3. Keyboard-only pass over notification form and dialogs', async ({ page }) => {
    const user = generateUserData('keyboard');
    await registerAndGoToNotifications(page, user);

    // Open Add Channel dialog and verify focus moves inside
    await page.getByRole('button', { name: 'Add Channel' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#channel-name')).toBeFocused();

    // Escape closes dialog and returns focus to Add Channel button
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Channel' })).toBeFocused();
  });

  test('4. Second-user multi-tenant isolation over notification channels', async ({ browser }) => {
    // User A sets up a channel
    const userA = generateUserData('userA');
    const userB = generateUserData('userB');

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await registerAndGoToNotifications(pageA, userA);

    await pageA.getByRole('button', { name: 'Add Channel' }).click();
    await pageA.getByLabel('Channel Name').fill("User A Private Channel");
    await pageA.getByLabel('Webhook URL').fill('https://example.com/api/webhooks/usera');

    const [createResponse] = await Promise.all([
      pageA.waitForResponse((res) => res.url().includes('/notifications/channels') && res.request().method() === 'POST'),
      pageA.getByRole('button', { name: 'Create Channel' }).click()
    ]);
    const json = await createResponse.json();
    const userAChannelId = json.data.channel._id || json.data.channel.id;
    await pageA.locator('#confirm-secret-saved').check();
    await pageA.getByRole('button', { name: 'I have saved it' }).click();

    // User B registers in a clean browser context
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await registerAndGoToNotifications(pageB, userB);

    // User B sees no channels or deliveries of User A
    await expect(pageB.getByText('No notification channels configured')).toBeVisible();
    await expect(pageB.getByText('No recent alert deliveries recorded.')).toBeVisible();

    // User B direct API mutation attempt on User A's channel -> 404
    const mutateAttempt = await pageB.request.patch(`http://localhost:5000/api/v1/notifications/channels/${userAChannelId}`, {
      data: { name: 'Hacked Channel Name' }
    });
    expect(mutateAttempt.status()).toBe(404);
    const mutateBody = await mutateAttempt.json();
    expect(mutateBody.message).toMatch(/not found/i);

    // User B direct client route navigation to User A's channel -> 404 page
    await pageB.goto(`/notifications/${userAChannelId}`);
    await expect(pageB.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(pageB.getByText('Page not found')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

});

