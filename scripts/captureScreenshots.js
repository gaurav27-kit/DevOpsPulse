import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../e2e/node_modules/@playwright/test/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'frontend', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function startServer(port = 4173) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';

      let filePath = path.join(distDir, reqPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

const demoDashboardData = {
  range: '24h',
  applications: {
    total: 4,
    byStatus: {
      unknown: 0,
      up: 2,
      degraded: 1,
      down: 1
    }
  },
  incidents: {
    activeCount: 1,
    activeBySeverity: {
      low: 0,
      medium: 0,
      high: 1,
      critical: 0
    },
    recent: [
      {
        _id: '672722b5c5e893e3d9370020',
        title: 'Elevated latency on Billing DB connection pool',
        severity: 'high',
        status: 'investigating',
        isActive: true,
        applicationId: {
          _id: '672722b5c5e893e3d9370012',
          name: 'Billing Service API'
        },
        startedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString()
      },
      {
        _id: '672722b5c5e893e3d9370021',
        title: 'Transient DNS resolution timeout on Auth replica',
        severity: 'medium',
        status: 'resolved',
        isActive: false,
        applicationId: {
          _id: '672722b5c5e893e3d9370011',
          name: 'Core Authentication Service'
        },
        startedAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
        resolvedAt: new Date(Date.now() - 95 * 60 * 1000).toISOString()
      }
    ]
  },
  deployments: {
    recent: [
      {
        _id: '672722b5c5e893e3d9370030',
        version: 'v2.4.1',
        environment: 'production',
        status: 'success',
        branch: 'main',
        commitSha: 'a1b2c3d4e5f6',
        applicationId: {
          _id: '672722b5c5e893e3d9370010',
          name: 'Payment & Checkout Gateway'
        },
        startedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString()
      },
      {
        _id: '672722b5c5e893e3d9370031',
        version: 'v1.12.0',
        environment: 'production',
        status: 'success',
        branch: 'main',
        commitSha: 'e4f5g6h7i8j9',
        applicationId: {
          _id: '672722b5c5e893e3d9370012',
          name: 'Billing Service API'
        },
        startedAt: new Date(Date.now() - 180 * 60 * 1000).toISOString()
      }
    ]
  },
  health: {
    totalChecks: 1152,
    uptimePercent: 99.4,
    avgResponseTimeMs: 142
  },
  applicationsTable: [
    {
      id: '672722b5c5e893e3d9370013',
      name: 'Notifications & Webhooks Worker',
      url: 'https://worker.devopspulse.io',
      environment: 'production',
      status: 'down',
      uptimePercent: 94.12,
      lastCheckedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString()
    },
    {
      id: '672722b5c5e893e3d9370012',
      name: 'Billing Service API',
      url: 'https://billing.devopspulse.io',
      environment: 'production',
      status: 'degraded',
      uptimePercent: 98.40,
      lastCheckedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString()
    },
    {
      id: '672722b5c5e893e3d9370010',
      name: 'Payment & Checkout Gateway',
      url: 'https://checkout.devopspulse.io',
      environment: 'production',
      status: 'up',
      uptimePercent: 99.98,
      lastCheckedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString()
    },
    {
      id: '672722b5c5e893e3d9370011',
      name: 'Core Authentication Service',
      url: 'https://auth.devopspulse.io',
      environment: 'production',
      status: 'up',
      uptimePercent: 100.0,
      lastCheckedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
    }
  ]
};

async function main() {
  console.log('Starting static server on port 4173...');
  const server = await startServer(4173);
  console.log('Static server running.');

  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Mock all API endpoints
  await context.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: '672722b5c5e893e3d9370001',
              name: 'Alex Rivera',
              email: 'alex.rivera@devopspulse.io',
              role: 'admin'
            }
          }
        })
      });
    }

    if (url.includes('/api/v1/dashboard/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: demoDashboardData
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} })
    });
  });

  const brainArtifactDir = 'C:\\Users\\gaura\\.gemini\\antigravity\\brain\\b101ee9a-e757-43c5-886d-b3b112895c69';
  const designRefDir = path.resolve(projectRoot, 'frontend', 'design-reference');

  // 1. Desktop Screenshot
  console.log('Capturing Desktop screenshot (1280x900)...');
  const desktopPage = await context.newPage();
  await desktopPage.setViewportSize({ width: 1280, height: 900 });
  await desktopPage.goto('http://127.0.0.1:4173/dashboard');
  await desktopPage.waitForSelector('text=Welcome, Alex Rivera');
  await desktopPage.waitForSelector('table');
  await desktopPage.waitForTimeout(500); // Allow fonts & icons to settle

  const desktopDest1 = path.join(designRefDir, 'dashboard-desktop.png');
  const desktopDest2 = path.join(brainArtifactDir, 'dashboard-desktop.png');
  await desktopPage.screenshot({ path: desktopDest1, fullPage: true });
  await desktopPage.screenshot({ path: desktopDest2, fullPage: true });
  console.log(`Saved desktop screenshot to ${desktopDest1} and ${desktopDest2}`);
  await desktopPage.close();

  // 2. Mobile Screenshot
  console.log('Capturing Mobile screenshot (375x812)...');
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 375, height: 812 });
  await mobilePage.goto('http://127.0.0.1:4173/dashboard');
  await mobilePage.waitForSelector('h1:has-text("Welcome, Alex Rivera")');
  await mobilePage.waitForTimeout(1000);

  const mobileDest1 = path.join(designRefDir, 'dashboard-mobile.png');
  const mobileDest2 = path.join(brainArtifactDir, 'dashboard-mobile.png');
  await mobilePage.screenshot({ path: mobileDest1, fullPage: true });
  await mobilePage.screenshot({ path: mobileDest2, fullPage: true });
  console.log(`Saved mobile screenshot to ${mobileDest1} and ${mobileDest2}`);
  await mobilePage.close();

  await browser.close();
  server.close();
  console.log('All screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
