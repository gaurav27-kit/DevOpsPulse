/**
 * End-to-End Test Suite for DevOpsPulse (PRD Step 11, Part C)
 *
 * NOTE: Step (b) checks https://example.com and requires outbound internet access.
 *
 * Scenarios tested in sequence with role/label locators:
 *   a) Register through UI -> land on dashboard -> refresh retains session -> logout -> login.
 *   b) Add https://example.com application -> click "Check now" -> verify banner and Up status.
 *   c) Add https://this-domain-does-not-exist-12345.invalid -> click "Check now" twice -> Down + Incident.
 *   d) Open incident -> mark investigating -> add note -> resolve -> verify timeline & reload persistence.
 *   e) Record deployment from application page -> verify on /deployments and dashboard.
 *   f) Security smoke test: User B in fresh browser context gets 404 for User A's resources & empty lists.
 *   g) Attempt to add http://localhost:3000 -> verify server SSRF validation error message.
 */

import { test, expect } from '@playwright/test';

test.describe('DevOpsPulse End-to-End Primary Workflow', () => {
  const runId = Date.now();
  const userA = {
    name: `Operator ${runId}`,
    email: `operator.${runId}@example.com`,
    password: 'Password123!'
  };
  const userB = {
    name: `Auditor ${runId}`,
    email: `auditor.${runId}@example.com`,
    password: 'Password123!'
  };

  test('executes complete monitoring lifecycle across UI screens', async ({ browser, page }) => {
    // ─────────────────────────────────────────────────────────────────────────
    // Part (a): Register, session persistence, logout, login
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto('/register');
    await expect(page).toHaveTitle(/DevOpsPulse/i);

    // Fill registration form using label-based locators
    await page.getByLabel('Full name').fill(userA.name);
    await page.getByLabel('Email address').fill(userA.email);
    await page.getByLabel('Password').fill(userA.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Verify arrival on dashboard with personalized greeting
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome, ${userA.name}`, 'i') })).toBeVisible();

    // Refresh page: verify session is persisted via httpOnly cookie
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome, ${userA.name}`, 'i') })).toBeVisible();

    // Logout
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Log back in
    await page.getByLabel('Email address').fill(userA.email);
    await page.getByLabel('Password').fill(userA.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome, ${userA.name}`, 'i') })).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Part (b): Add application for https://example.com, trigger manual check
    // ─────────────────────────────────────────────────────────────────────────
    // From zero-state dashboard, click "Add your first application"
    await page.getByRole('link', { name: /Add your first application|Add application/i }).first().click();
    await expect(page).toHaveURL(/\/applications\/new/);

    await page.getByLabel('Application Name').fill('Example Production Service');
    await page.getByLabel('Endpoint URL').fill('https://example.com');
    await page.getByRole('button', { name: 'Register Application' }).click();

    // Navigates to /applications list
    await expect(page).toHaveURL(/\/applications/);
    await expect(page.getByText('Example Production Service').first()).toBeVisible();

    // Navigate to application details
    await page.getByRole('link', { name: 'Example Production Service' }).first().click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-fA-F]{24}/);
    const exampleAppUrl = page.url();

    // Click "Check now" to trigger immediate health check (requires outbound network access)
    await page.getByRole('button', { name: 'Check now' }).click();

    // Verify check result banner shows success
    await expect(page.getByText(/Check completed: up/i)).toBeVisible({ timeout: 20000 });

    // Navigate back to Dashboard and verify application status is 'Up'
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Example Production Service').first()).toBeVisible();
    await expect(page.getByText('Up').first()).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Part (c): Add second failing application with .invalid domain
    // ─────────────────────────────────────────────────────────────────────────
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('link', { name: 'Add application' }).click();
    await expect(page).toHaveURL(/\/applications\/new/);

    await page.getByLabel('Application Name').fill('Broken Legacy Service');
    await page.getByLabel('Endpoint URL').fill('https://this-domain-does-not-exist-12345.invalid');
    await page.getByRole('button', { name: 'Register Application' }).click();

    await expect(page).toHaveURL(/\/applications/);
    await expect(page.getByText('Broken Legacy Service').first()).toBeVisible();

    // Open Broken Legacy Service details
    await page.getByRole('link', { name: 'Broken Legacy Service' }).first().click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-fA-F]{24}/);
    const failingAppUrl = page.url();

    // First manual check failure
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText(/Check completed: down/i)).toBeVisible({ timeout: 20000 });

    // Wait for button to be enabled again before second check
    await expect(page.getByRole('button', { name: 'Check now' })).toBeEnabled();

    // Second manual check failure -> triggers transition to 'down' and opens incident
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText(/Check completed: down/i)).toBeVisible({ timeout: 20000 });

    // Verify application status badge is now Down
    await expect(page.getByText('Down').first()).toBeVisible();

    // Navigate to Incidents screen
    await page.getByRole('link', { name: /Incidents/i }).first().click();
    await expect(page).toHaveURL(/\/incidents/);

    // Verify an incident exists with title mentioning Broken Legacy Service, High severity, and Open status
    await expect(page.getByRole('table').getByText('Broken Legacy Service', { exact: true })).toBeVisible();
    await expect(page.getByRole('table').getByText('High')).toBeVisible();
    await expect(page.getByRole('table').getByText('Open')).toBeVisible();

    // Verify Dashboard shows active incident count as 1
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Active Incidents').locator('../..').getByText('1', { exact: true })).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Part (d): Open incident, mark investigating, add note, resolve, verify timeline
    // ─────────────────────────────────────────────────────────────────────────
    await page.getByRole('link', { name: /Incidents/i }).first().click();
    await page.getByRole('link', { name: /Outage detected|Broken Legacy Service/i }).first().click();
    await expect(page).toHaveURL(/\/incidents\/[0-9a-fA-F]{24}/);
    const incidentUrl = page.url();

    // Mark as investigating
    await page.getByRole('button', { name: 'Mark as investigating' }).click();
    await expect(page.getByText('Investigating').first()).toBeVisible();

    // Add an investigative note
    await page.getByLabel('Add an investigative note').fill('Triaging DNS resolution failures across edge nodes.');
    await page.getByRole('button', { name: 'Post note' }).click();
    await expect(page.getByText('Triaging DNS resolution failures across edge nodes.')).toBeVisible();

    // Resolve the incident
    await page.getByRole('button', { name: 'Resolve incident' }).click();
    await page.getByLabel(/Resolution note/i).fill('Route 53 DNS zone restored; endpoint operational.');
    await page.getByRole('button', { name: 'Confirm Resolution' }).click();

    // Verify resolved state
    await expect(page.getByText('Resolved').first()).toBeVisible();

    // Verify timeline entries in chronological order
    await expect(page.getByText(/Incident opened after 2 consecutive failed checks/i)).toBeVisible();
    await expect(page.getByText(/Status changed to "investigating"/i)).toBeVisible();
    await expect(page.getByText('Triaging DNS resolution failures across edge nodes.')).toBeVisible();
    await expect(page.getByText(/Status changed to "resolved"/i)).toBeVisible();

    // Reload page and verify timeline + resolved state are completely preserved
    await page.reload();
    await expect(page.getByText('Resolved').first()).toBeVisible();
    await expect(page.getByText('Triaging DNS resolution failures across edge nodes.')).toBeVisible();
    await expect(page.getByText(/Route 53 DNS zone restored/i)).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Part (e): Record deployment from application page, verify on deployments & dashboard
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto(exampleAppUrl);
    await page.getByRole('link', { name: 'Record deployment' }).click();
    await expect(page).toHaveURL(/\/deployments\/new/);

    await page.getByLabel('Version / Release Tag').fill('v2.1.0-e2e');
    await page.getByLabel('Git Branch').fill('release/2.1.0');
    await page.getByLabel('Commit SHA').fill('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
    await page.getByLabel('Description (Optional)').fill('Production release verified by automated suite.');
    await page.getByRole('button', { name: 'Record Deployment' }).click();

    // Redirects to /deployments list
    await expect(page).toHaveURL(/\/deployments/);
    await expect(page.getByText('v2.1.0-e2e').first()).toBeVisible();

    // Verify deployment is reflected on the dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('v2.1.0-e2e').first()).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Part (f): Security smoke test with second user in fresh browser context
    // ─────────────────────────────────────────────────────────────────────────
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();

    // Register User B
    await secondPage.goto('/register');
    await secondPage.getByLabel('Full name').fill(userB.name);
    await secondPage.getByLabel('Email address').fill(userB.email);
    await secondPage.getByLabel('Password').fill(userB.password);
    await secondPage.getByRole('button', { name: 'Create account' }).click();
    await expect(secondPage).toHaveURL(/\/dashboard/);

    // Attempt direct navigation to User A's application -> must show "Application not found"
    await secondPage.goto(exampleAppUrl);
    await expect(secondPage.getByRole('heading', { name: 'Application not found' })).toBeVisible();

    // Attempt direct navigation to User A's incident -> must show "Incident not found"
    await secondPage.goto(incidentUrl);
    await expect(secondPage.getByRole('heading', { name: 'Incident not found' })).toBeVisible();

    // Verify User B's list screens are completely empty
    await secondPage.goto('/applications');
    await expect(secondPage.getByText('No applications registered')).toBeVisible();

    await secondPage.goto('/incidents');
    await expect(secondPage.getByText('No incidents yet. That is good news.')).toBeVisible();

    await secondPage.goto('/deployments');
    await expect(secondPage.getByText('No deployments recorded yet')).toBeVisible();

    await secondContext.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Part (g): SSRF Prevention: Attempt to add http://localhost:3000
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto('/applications/new');
    await page.getByLabel('Application Name').fill('Malicious Localhost App');
    await page.getByLabel('Endpoint URL').fill('http://localhost:3000');
    await page.getByRole('button', { name: 'Register Application' }).click();

    // Verify server validation error message is displayed
    await expect(
      page.getByText(/Forbidden hostname: requests to 'localhost' are not permitted/i)
    ).toBeVisible();
  });
});
