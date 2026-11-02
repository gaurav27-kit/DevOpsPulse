/**
 * backend/scripts/seedDemoData.js
 *
 * DEV-ONLY seed script to populate realistic demo applications, 24 hours of health checks,
 * and an incident for a given user.
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
      hasOutage: true // 40-minute outage 2 hours ago, now recovered
    },
    {
      name: `${DEMO_PREFIX} Core Authentication Service`,
      url: 'https://auth.pulse-demo.io',
      environment: 'production',
      hasOutage: false
    },
    {
      name: `${DEMO_PREFIX} Search & Catalog API`,
      url: 'https://catalog-staging.pulse-demo.io',
      environment: 'staging',
      hasOutage: false
    },
    {
      name: `${DEMO_PREFIX} Notifications & Webhooks Worker`,
      url: 'https://worker-dev.pulse-demo.io',
      environment: 'development',
      hasOutage: false
    }
  ];

  // Helper for random integer in range
  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  for (const config of demoAppsConfig) {
    const app = await Application.create({
      ownerId: user._id,
      name: config.name,
      url: config.url,
      environment: config.environment,
      status: 'up',
      checkIntervalSeconds: 300,
      timeoutMs: 10000,
      consecutiveFailures: 0,
      consecutiveSuccesses: 2,
      lastCheckedAt: now,
      lastSuccessfulAt: now,
      nextCheckAt: farFuture
    });

    console.log(`Created demo app: "${app.name}" (${app.environment})`);

    // Create 24 hours of checks (1 check every 5 minutes = 288 checks)
    const healthChecks = [];
    const totalMinutes = 24 * 60;
    const intervalMinutes = 5;

    // For the outage app: outage occurred from 150 mins ago to 110 mins ago (40 mins = 8 checks)
    const outageStartMinutesAgo = 150;
    const outageEndMinutesAgo = 110;

    let latestCheck = null;

    for (let m = totalMinutes; m >= 0; m -= intervalMinutes) {
      const checkedAt = new Date(now.getTime() - m * 60 * 1000);
      let success = true;
      let statusCode = 200;
      let responseTimeMs = randomInt(80, 450);
      let errorType = null;
      let errorMessage = null;

      // Occasional slow response (~2500ms)
      if (Math.random() < 0.04) {
        responseTimeMs = randomInt(2100, 2700);
      }

      // Outage window check
      if (config.hasOutage && m <= outageStartMinutesAgo && m > outageEndMinutesAgo) {
        success = false;
        statusCode = 503;
        responseTimeMs = randomInt(500, 1500);
        errorType = 'http_error';
        errorMessage = 'Server returned HTTP 503 Service Unavailable';
      }

      const checkDoc = {
        applicationId: app._id,
        ownerId: user._id,
        checkedAt,
        success,
        statusCode,
        responseTimeMs,
        errorType,
        errorMessage
      };

      healthChecks.push(checkDoc);
      latestCheck = checkDoc;
    }

    await HealthCheck.insertMany(healthChecks);
    console.log(`  -> Inserted ${healthChecks.length} health checks.`);

    // If this app had an outage, create a resolved incident
    if (config.hasOutage) {
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

    // Add a recent deployment for demo realism
    await Deployment.create({
      applicationId: app._id,
      ownerId: user._id,
      version: 'v2.4.1',
      commitSha: '7f9a1b2c3d',
      branch: 'main',
      environment: app.environment,
      status: 'success',
      source: 'manual',
      startedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000 + 45 * 1000),
      description: 'Production release: performance optimization & bug fixes'
    });
  }

  console.log('\n[Success] Demo data successfully seeded for:', emailArg);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[Error] Seed failed:', err);
  process.exit(1);
});
