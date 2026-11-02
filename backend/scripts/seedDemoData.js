/**
 * backend/scripts/seedDemoData.js
 *
 * DEV-ONLY seed script to populate realistic demo applications, 24 hours of health checks,
 * open & resolved incidents, and deployments for a given user.
 *
 * Usage:
 *   node scripts/seedDemoData.js <email>
 *   node scripts/seedDemoData.js <email> --reset
 *
 * SAFETY:
 *   - Refuses to run if NODE_ENV === 'production'
 *   - Marks all created apps with "[DEMO]" prefix
 *   - --reset only deletes items created with "[DEMO]" prefix
 */

import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Application } from '../src/models/Application.js';
import { HealthCheck } from '../src/models/HealthCheck.js';
import { Incident } from '../src/models/Incident.js';
import { Deployment } from '../src/models/Deployment.js';

// Guard against running in production
if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
  console.error('[Error] seedDemoData.js cannot run in production environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const isReset = args.includes('--reset');
const emailArg = args.find((a) => !a.startsWith('--'));

if (!emailArg) {
  console.error('Usage: npm run seed:demo -- <user-email> [--reset]');
  console.error('Example: npm run seed:demo -- admin@example.com');
  process.exit(1);
}

const DEMO_PREFIX = '[DEMO]';

async function main() {
  await connectDB();

  const user = await User.findOne({ email: emailArg.toLowerCase().trim() });
  if (!user) {
    console.error(`[Error] User with email "${emailArg}" was not found. Please register first.`);
    process.exit(1);
  }

  // Find existing demo apps for this user
  const existingDemoApps = await Application.find({
    ownerId: user._id,
    name: { $regex: `^\\${DEMO_PREFIX}` }
  });
  const demoAppIds = existingDemoApps.map((a) => a._id);

  if (demoAppIds.length > 0) {
    console.log(`Cleaning up ${demoAppIds.length} existing demo application(s)...`);
    await HealthCheck.deleteMany({ applicationId: { $in: demoAppIds } });
    await Incident.deleteMany({ applicationId: { $in: demoAppIds } });
    await Deployment.deleteMany({ applicationId: { $in: demoAppIds } });
    await Application.deleteMany({ _id: { $in: demoAppIds } });
    console.log('Existing demo data cleaned up.');
  }

  if (isReset) {
    console.log(`--reset flag passed. All demo data for ${emailArg} removed. Done!`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Creating fresh demo data for user: ${user.email} (${user._id})...`);

  // Future nextCheckAt so scheduler doesn't mutate our demo apps
  const farFuture = new Date('2099-01-01T00:00:00Z');
  const now = new Date();

  // 4 Demo Apps
  const demoAppsConfig = [
    {
      name: `${DEMO_PREFIX} Payment & Checkout Gateway`,
      url: 'https://checkout.pulse-demo.io',
      environment: 'production',
      status: 'up',
      hasResolvedOutage: true,
      hasOpenIncident: false
    },
    {
      name: `${DEMO_PREFIX} Notifications & Webhooks Worker`,
      url: 'https://worker-dev.pulse-demo.io',
      environment: 'production',
      status: 'down',
      consecutiveFailures: 5,
      hasResolvedOutage: false,
      hasOpenIncident: true // Currently active/down incident
    },
    {
      name: `${DEMO_PREFIX} Core Authentication Service`,
      url: 'https://auth.pulse-demo.io',
      environment: 'production',
      status: 'up',
      hasResolvedOutage: false,
      hasOpenIncident: false
    },
    {
      name: `${DEMO_PREFIX} Search & Catalog API`,
      url: 'https://catalog-staging.pulse-demo.io',
      environment: 'staging',
      status: 'up',
      hasResolvedOutage: false,
      hasOpenIncident: false
    }
  ];

  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const createdApps = [];

  for (const config of demoAppsConfig) {
    const isDown = config.status === 'down';
    const app = await Application.create({
      ownerId: user._id,
      name: config.name,
      url: config.url,
      environment: config.environment,
      status: config.status,
      checkIntervalSeconds: 300,
      timeoutMs: 10000,
      consecutiveFailures: isDown ? 5 : 0,
      consecutiveSuccesses: isDown ? 0 : 2,
      lastCheckedAt: now,
      lastSuccessfulAt: isDown ? new Date(now.getTime() - 25 * 60 * 1000) : now,
      nextCheckAt: farFuture
    });

    createdApps.push(app);
    console.log(`Created demo app: "${app.name}" (${app.environment}, status: ${app.status})`);

    // Create 24 hours of checks (1 check every 5 minutes = 289 checks)
    const healthChecks = [];
    const totalMinutes = 24 * 60;
    const intervalMinutes = 5;

    // For the resolved outage app: outage 150 to 110 mins ago
    const outageStartMinutesAgo = 150;
    const outageEndMinutesAgo = 110;

    for (let m = totalMinutes; m >= 0; m -= intervalMinutes) {
      const checkedAt = new Date(now.getTime() - m * 60 * 1000);
      let success = true;
      let statusCode = 200;
      let responseTimeMs = randomInt(80, 450);
      let errorType = null;
      let errorMessage = null;

      if (Math.random() < 0.04) {
        responseTimeMs = randomInt(2100, 2700);
      }

      // Past resolved outage
      if (config.hasResolvedOutage && m <= outageStartMinutesAgo && m > outageEndMinutesAgo) {
        success = false;
        statusCode = 503;
        responseTimeMs = randomInt(500, 1500);
        errorType = 'http_error';
        errorMessage = 'Server returned HTTP 503 Service Unavailable';
      }

      // Currently down app: last 5 checks failed (last 25 minutes)
      if (config.hasOpenIncident && m <= 25) {
        success = false;
        statusCode = 500;
        responseTimeMs = randomInt(800, 2000);
        errorType = 'http_error';
        errorMessage = 'Internal Server Error (Database Connection Refused)';
      }

      healthChecks.push({
        applicationId: app._id,
        ownerId: user._id,
        checkedAt,
        success,
        statusCode,
        responseTimeMs,
        errorType,
        errorMessage
      });
    }

    await HealthCheck.insertMany(healthChecks);
    console.log(`  -> Inserted ${healthChecks.length} health checks.`);

    // 1. Resolved incident for past outage
    if (config.hasResolvedOutage) {
      const incidentStarted = new Date(now.getTime() - outageStartMinutesAgo * 60 * 1000);
      const incidentResolved = new Date(now.getTime() - outageEndMinutesAgo * 60 * 1000);

      await Incident.create({
        applicationId: app._id,
        ownerId: user._id,
        title: `${app.name} is down`,
        severity: 'high',
        status: 'resolved',
        isActive: false,
        startedAt: incidentStarted,
        lastFailureAt: new Date(incidentResolved.getTime() - 5 * 60 * 1000),
        failureCount: 8,
        resolvedAt: incidentResolved,
        updates: [
          {
            message: 'Incident opened after 2 consecutive failed checks. Last error: http_error',
            type: 'system',
            author: null,
            createdAt: incidentStarted
          },
          {
            message: 'Database connection pool exhausted. Failover initiated.',
            type: 'note',
            author: user._id,
            createdAt: new Date(incidentStarted.getTime() + 15 * 60 * 1000)
          },
          {
            message: 'Resolved automatically after 2 consecutive successful checks.',
            type: 'system',
            author: null,
            createdAt: incidentResolved
          }
        ]
      });
      console.log('  -> Created resolved outage incident.');
    }

    // 2. Open incident for currently down app
    if (config.hasOpenIncident) {
      const incidentStarted = new Date(now.getTime() - 25 * 60 * 1000);

      await Incident.create({
        applicationId: app._id,
        ownerId: user._id,
        title: `${app.name} is down`,
        severity: 'high',
        status: 'open',
        isActive: true,
        startedAt: incidentStarted,
        lastFailureAt: now,
        failureCount: 5,
        resolvedAt: null,
        updates: [
          {
            message: 'Incident opened after 2 consecutive failed checks. Last error: http_error',
            type: 'system',
            author: null,
            createdAt: incidentStarted
          },
          {
            message: 'Team investigating server 500 error response and database connectivity.',
            type: 'note',
            author: user._id,
            createdAt: new Date(incidentStarted.getTime() + 10 * 60 * 1000)
          }
        ]
      });
      console.log('  -> Created active OPEN incident (failureCount: 5).');
    }
  }

  // 6 Demo Deployments across demo apps
  console.log('\nCreating 6 demo deployments with mixed statuses and branches...');
  const demoDeployments = [
    {
      app: createdApps[0], // Payment
      version: 'v2.4.2',
      branch: 'main',
      commitSha: 'a1b2c3d4e5f6',
      status: 'success',
      startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000 + 45 * 1000),
      description: 'Patch: Stripe webhook timeout fix and retry backoff'
    },
    {
      app: createdApps[1], // Worker
      version: 'v1.4.0-rc2',
      branch: 'release/v1.4',
      commitSha: 'e5f6a7b8c9d0',
      status: 'failed',
      startedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000 + 120 * 1000),
      description: 'Worker queue consumer optimization (failed sanity health checks)'
    },
    {
      app: createdApps[0], // Payment
      version: 'v2.4.1',
      branch: 'main',
      commitSha: '9f8e7d6c5b4a',
      status: 'rolled_back',
      startedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000 + 90 * 1000),
      description: 'Database schema migration rollback after replica lag detected'
    },
    {
      app: createdApps[3], // Search
      version: 'v1.9.0',
      branch: 'feat/elasticsearch-upgrade',
      commitSha: '112233445566',
      status: 'success',
      startedAt: new Date(now.getTime() - 14 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 14 * 60 * 60 * 1000 + 65 * 1000),
      description: 'Staging release: upgrade search cluster client'
    },
    {
      app: createdApps[2], // Auth
      version: 'v3.1.0',
      branch: 'main',
      commitSha: '556677889900',
      status: 'success',
      startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 50 * 1000),
      description: 'OAuth 2.1 refresh token rotation enforcement'
    },
    {
      app: createdApps[1], // Worker
      version: 'v1.3.8',
      branch: 'hotfix/leak-patch',
      commitSha: 'aabbccddeeff',
      status: 'success',
      startedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000 + 30 * 1000),
      description: 'Hotfix: fix memory leak in Redis subscription listener'
    }
  ];

  for (const dep of demoDeployments) {
    await Deployment.create({
      applicationId: dep.app._id,
      ownerId: user._id,
      version: dep.version,
      branch: dep.branch,
      commitSha: dep.commitSha,
      environment: dep.app.environment,
      status: dep.status,
      source: 'manual',
      startedAt: dep.startedAt,
      completedAt: dep.completedAt,
      description: dep.description
    });
    console.log(`  -> Created deployment ${dep.version} (${dep.status}) for ${dep.app.name}`);
  }

  console.log('\n[Success] Demo data successfully seeded for:', emailArg);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[Error] Seed failed:', err);
  process.exit(1);
});
