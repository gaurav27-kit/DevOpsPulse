# DevOpsPulse End-to-End Test Suite (Playwright)

This directory contains the automated end-to-end (E2E) integration test suite covering the full monitoring lifecycle across the user interface.

## Prerequisites

- Node.js LTS (v18+)
- MongoDB running locally on port 27017
- Outbound internet access (required for `https://example.com` health-check verification)

## Running E2E Tests on Windows PowerShell

Ensure MongoDB is running locally, then execute:

```powershell
# Navigate to e2e directory
cd e2e

# Run Playwright test suite (automatically starts backend on :5000 and frontend on :5173)
npm run test:e2e
```

To run with UI mode for debugging:

```powershell
npx playwright test --ui
```

To view HTML test reports:

```powershell
npx playwright show-report
```

## Database Safety Guard

Before executing tests, `scripts/resetTestDb.js` runs via Playwright's `globalSetup`. It strictly verifies that the target database name ends with `_test` (default: `devopspulse_test`) before truncating test collections. Real development and production databases are never touched.

