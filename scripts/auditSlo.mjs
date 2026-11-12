/**
 * scripts/auditSlo.mjs
 *
 * Read-only audit script for SLO calculations and data.
 * Refuses to run if NODE_ENV === 'production'.
 * Uses ONLY read operations (find, aggregate, countDocuments).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Refusing to run in NODE_ENV=production. Audit is read-only for non-production environments.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import mongoose from '../backend/node_modules/mongoose/index.js';
import dotenv from '../backend/node_modules/dotenv/lib/main.js';

dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

import { User } from '../backend/src/models/User.js';
import { Application } from '../backend/src/models/Application.js';
import { Slo } from '../backend/src/models/Slo.js';
import { HealthCheck } from '../backend/src/models/HealthCheck.js';
import { HealthCheckDaily } from '../backend/src/models/HealthCheckDaily.js';
import { Incident } from '../backend/src/models/Incident.js';
import { getSloForApplication } from '../backend/src/services/sloService.js';
import { computeSloStats, classifySlo, computeBurnRate, computeCoverage } from '../backend/src/services/sloRules.js';

const targetEmail = process.argv[2] || 'alex@gmail.com';
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/devopspulse';

async function runAudit() {
  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  try {
    const user = await User.findOne({ email: targetEmail }).lean();
    if (!user) {
      console.error(`User not found with email: ${targetEmail}`);
      process.exit(1);
    }

    console.log(`Auditing user: ${user.name} (${user.email}, ID: ${user._id})`);

    const applications = await Application.find({ ownerId: user._id }).sort({ name: 1 }).lean();
    console.log(`Found ${applications.length} applications for user.`);

    const auditResults = {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email
      },
      auditedAt: new Date().toISOString(),
      applications: []
    };

    for (const app of applications) {
      console.log(`\n========================================`);
      console.log(`Auditing Application: ${app.name} (${app._id})`);
      console.log(`URL: ${app.url}`);
      console.log(`Current Status: ${app.status}`);

      const slo = await Slo.findOne({ applicationId: app._id, ownerId: user._id }).lean();
      if (!slo) {
        console.log(`No SLO configured for this application.`);
        auditResults.applications.push({
          applicationId: app._id.toString(),
          name: app.name,
          url: app.url,
          status: app.status,
          hasSlo: false
        });
        continue;
      }

      console.log(`SLO found: target=${slo.targetPercent}%, window=${slo.windowDays}d`);

      // 1. Get evaluated result from the real API service
      let apiSloResult = null;
      try {
        apiSloResult = await getSloForApplication(user._id, app._id);
      } catch (err) {
        apiSloResult = { error: err.message };
      }

      // 2. Window boundaries for raw query
      const now = new Date();
      const windowStart = new Date(now.getTime() - slo.windowDays * 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

      const startOfFromDay = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate()));
      const endOfFromDay = new Date(startOfFromDay.getTime() + 24 * 60 * 60 * 1000);
      const startOfToDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      // 3. Raw counts in window
      const rawChecksInWindow = await HealthCheck.find({
        applicationId: app._id,
        checkedAt: { $gte: windowStart, $lte: now }
      }).sort({ checkedAt: 1 }).lean();

      const rawTotal = rawChecksInWindow.length;
      let rawGood = 0;
      let rawBad = 0;
      const errorTypeCounts = {};
      const statusCodeCounts = {};
      const perDayCounts = {};

      for (const c of rawChecksInWindow) {
        if (c.success) {
          rawGood++;
        } else {
          rawBad++;
        }

        const errType = c.errorType || (c.success ? 'none' : 'unspecified');
        errorTypeCounts[errType] = (errorTypeCounts[errType] || 0) + 1;

        const code = c.statusCode != null ? String(c.statusCode) : 'null';
        statusCodeCounts[code] = (statusCodeCounts[code] || 0) + 1;

        const dayKey = c.checkedAt.toISOString().slice(0, 10);
        if (!perDayCounts[dayKey]) {
          perDayCounts[dayKey] = { good: 0, bad: 0, total: 0 };
        }
        perDayCounts[dayKey].total++;
        if (c.success) perDayCounts[dayKey].good++;
        else perDayCounts[dayKey].bad++;
      }

      // First and last checks (in window and all-time)
      const firstCheckInWindow = rawChecksInWindow[0]?.checkedAt || null;
      const lastCheckInWindow = rawChecksInWindow[rawChecksInWindow.length - 1]?.checkedAt || null;

      const allTimeFirst = await HealthCheck.findOne({ applicationId: app._id }).sort({ checkedAt: 1 }).lean();
      const allTimeLast = await HealthCheck.findOne({ applicationId: app._id }).sort({ checkedAt: -1 }).lean();

      // 4. Rollup counts in window
      const rollups = await HealthCheckDaily.find({
        applicationId: app._id,
        day: { $gte: endOfFromDay, $lte: startOfToDay }
      }).sort({ day: 1 }).lean();

      let rollupTotal = 0;
      let rollupGood = 0;
      let rollupBad = 0;
      for (const r of rollups) {
        rollupTotal += r.total;
        rollupGood += r.good;
        rollupBad += (r.total - r.good);
      }

      // Boundary raw checks: [windowStart, endOfFromDay)
      const boundaryRawChecks = await HealthCheck.find({
        applicationId: app._id,
        checkedAt: { $gte: windowStart, $lt: endOfFromDay }
      }).lean();
      const boundaryTotal = boundaryRawChecks.length;
      const boundaryGood = boundaryRawChecks.filter(c => c.success).length;
      const boundaryBad = boundaryTotal - boundaryGood;

      const hybridTotal = boundaryTotal + rollupTotal;
      const hybridGood = boundaryGood + rollupGood;
      const hybridBad = boundaryBad + rollupBad;

      const drift = {
        totalDiff: rawTotal - hybridTotal,
        goodDiff: rawGood - hybridGood,
        badDiff: rawBad - hybridBad
      };

      // 5. Lookback windows for burn rates (1h and 6h)
      const checks1h = rawChecksInWindow.filter(c => c.checkedAt >= oneHourAgo);
      const total1h = checks1h.length;
      const bad1h = checks1h.filter(c => !c.success).length;

      const checks6h = rawChecksInWindow.filter(c => c.checkedAt >= sixHoursAgo);
      const total6h = checks6h.length;
      const bad6h = checks6h.filter(c => !c.success).length;

      // 6. Independent recomputation from raw checks
      const stats = computeSloStats({
        good: rawGood,
        total: rawTotal,
        targetPercent: slo.targetPercent
      });

      const coverage = computeCoverage(
        allTimeFirst?.checkedAt || firstCheckInWindow,
        now,
        slo.windowDays
      );

      const status = classifySlo(stats.budgetConsumedPct, rawTotal);

      const burnRate1hInd = computeBurnRate(bad1h, total1h, slo.targetPercent);
      const burnRate6hInd = computeBurnRate(bad6h, total6h, slo.targetPercent);

      const independentMetrics = {
        sli: stats.sli,
        errorRatePct: stats.errorRatePct,
        budgetConsumedPct: stats.budgetConsumedPct,
        budgetRemainingPct: stats.budgetRemainingPct,
        status,
        coveragePct: coverage.coveragePct,
        partialWindow: coverage.partialWindow,
        burnRate1h: burnRate1hInd,
        burnRate6h: burnRate6hInd,
        totals: stats.totals
      };

      // 7. Comparison with API values
      const comparison = {
        sli: {
          independent: independentMetrics.sli,
          api: apiSloResult?.sli ?? null,
          diff: (independentMetrics.sli != null && apiSloResult?.sli != null)
            ? Number((independentMetrics.sli - apiSloResult.sli).toFixed(4))
            : 0
        },
        budgetConsumedPct: {
          independent: independentMetrics.budgetConsumedPct,
          api: apiSloResult?.budgetConsumedPct ?? null,
          diff: (independentMetrics.budgetConsumedPct != null && apiSloResult?.budgetConsumedPct != null)
            ? Number((independentMetrics.budgetConsumedPct - apiSloResult.budgetConsumedPct).toFixed(4))
            : 0
        },
        budgetRemainingPct: {
          independent: independentMetrics.budgetRemainingPct,
          api: apiSloResult?.budgetRemainingPct ?? null,
          diff: (independentMetrics.budgetRemainingPct != null && apiSloResult?.budgetRemainingPct != null)
            ? Number((independentMetrics.budgetRemainingPct - apiSloResult.budgetRemainingPct).toFixed(4))
            : 0
        },
        burnRate1h: {
          independent: independentMetrics.burnRate1h,
          api: apiSloResult?.burnRate1h ?? null,
          diff: (independentMetrics.burnRate1h != null && apiSloResult?.burnRate1h != null)
            ? Number((independentMetrics.burnRate1h - apiSloResult.burnRate1h).toFixed(4))
            : 0
        },
        burnRate6h: {
          independent: independentMetrics.burnRate6h,
          api: apiSloResult?.burnRate6h ?? null,
          diff: (independentMetrics.burnRate6h != null && apiSloResult?.burnRate6h != null)
            ? Number((independentMetrics.burnRate6h - apiSloResult.burnRate6h).toFixed(4))
            : 0
        },
        status: {
          independent: independentMetrics.status,
          api: apiSloResult?.status ?? null,
          matches: independentMetrics.status === apiSloResult?.status
        }
      };

      // 8. Integrity checks:
      // foreign owner checks
      const foreignOwnerCount = await HealthCheck.countDocuments({
        applicationId: app._id,
        ownerId: { $ne: user._id }
      });

      // future dated checks
      const futureCheckCount = await HealthCheck.countDocuments({
        applicationId: app._id,
        checkedAt: { $gt: now }
      });

      // duplicate checks: same application, same second
      const duplicateSecondsAgg = await HealthCheck.aggregate([
        { $match: { applicationId: app._id } },
        {
          $project: {
            sec: { $dateToString: { format: '%Y-%m-%d %H:%M:%S', date: '$checkedAt' } }
          }
        },
        {
          $group: {
            _id: '$sec',
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } }
      ]);

      const duplicateCount = duplicateSecondsAgg.reduce((acc, curr) => acc + (curr.count - 1), 0);

      // 9. Special sections for "GitHub Public API" and "Payment API Recovery Test"
      let last30Checks = [];
      let statusTransitions = [];
      let incidentTimeline = [];

      if (app.name === 'GitHub Public API' || app.name === 'Payment API Recovery Test') {
        const last30 = await HealthCheck.find({ applicationId: app._id })
          .sort({ checkedAt: -1 })
          .limit(30)
          .lean();

        last30Checks = last30.map(c => ({
          checkedAt: c.checkedAt.toISOString(),
          statusCode: c.statusCode,
          responseTimeMs: c.responseTimeMs,
          success: c.success,
          errorType: c.errorType,
          errorMessage: c.errorMessage
        }));

        // Fetch all incidents
        const incidents = await Incident.find({ applicationId: app._id }).sort({ startedAt: 1 }).lean();
        incidentTimeline = incidents.map(inc => ({
          id: inc._id.toString(),
          title: inc.title,
          severity: inc.severity,
          status: inc.status,
          failureCount: inc.failureCount,
          startedAt: inc.startedAt ? inc.startedAt.toISOString() : null,
          resolvedAt: inc.resolvedAt ? inc.resolvedAt.toISOString() : null,
          durationSeconds: inc.startedAt && inc.resolvedAt
            ? Math.round((new Date(inc.resolvedAt) - new Date(inc.startedAt)) / 1000)
            : null
        }));

        // Detect check-by-check consecutive state transitions
        const allChecksAsc = await HealthCheck.find({ applicationId: app._id }).sort({ checkedAt: 1 }).lean();
        let runningConsecutiveFailures = 0;
        let runningConsecutiveSuccesses = 0;
        let inferredStatus = 'up';

        for (const c of allChecksAsc) {
          if (c.success) {
            runningConsecutiveSuccesses++;
            runningConsecutiveFailures = 0;
            if (inferredStatus === 'down' && runningConsecutiveSuccesses >= 2) {
              statusTransitions.push({
                timestamp: c.checkedAt.toISOString(),
                event: 'RECOVERED_TO_UP',
                triggerCheck: { statusCode: c.statusCode, responseTimeMs: c.responseTimeMs },
                consecutiveSuccesses: runningConsecutiveSuccesses
              });
              inferredStatus = 'up';
            }
          } else {
            runningConsecutiveFailures++;
            runningConsecutiveSuccesses = 0;
            if (inferredStatus === 'up' && runningConsecutiveFailures >= 2) {
              statusTransitions.push({
                timestamp: c.checkedAt.toISOString(),
                event: 'FAILED_TO_DOWN',
                triggerCheck: { statusCode: c.statusCode, errorType: c.errorType, errorMessage: c.errorMessage },
                consecutiveFailures: runningConsecutiveFailures
              });
              inferredStatus = 'down';
            }
          }
        }
      }

      const appAudit = {
        applicationId: app._id.toString(),
        name: app.name,
        url: app.url,
        currentAppStatus: app.status,
        sloStatus: apiSloResult?.status,
        sloConfig: {
          targetPercent: slo.targetPercent,
          windowDays: slo.windowDays,
          createdAt: slo.createdAt ? slo.createdAt.toISOString() : null
        },
        rawCountsInWindow: {
          total: rawTotal,
          good: rawGood,
          bad: rawBad
        },
        errorTypeBreakdown: errorTypeCounts,
        statusCodeBreakdown: statusCodeCounts,
        perDayCounts,
        timeline: {
          firstCheckInWindow: firstCheckInWindow ? firstCheckInWindow.toISOString() : null,
          lastCheckInWindow: lastCheckInWindow ? lastCheckInWindow.toISOString() : null,
          allTimeFirstCheck: allTimeFirst?.checkedAt ? allTimeFirst.checkedAt.toISOString() : null,
          allTimeLastCheck: allTimeLast?.checkedAt ? allTimeLast.checkedAt.toISOString() : null
        },
        rollupComparison: {
          rawWindowTotal: rawTotal,
          boundaryRawTotal: boundaryTotal,
          rollupTotal,
          hybridTotal,
          drift
        },
        independentMetrics,
        apiSloResult,
        comparison,
        integrity: {
          foreignOwnerCount,
          futureCheckCount,
          duplicateSecondsCount: duplicateSecondsAgg.length,
          totalDuplicateChecks: duplicateCount,
          duplicateSamples: duplicateSecondsAgg.slice(0, 5)
        },
        specialDetails: {
          last30Checks,
          statusTransitions,
          incidentTimeline
        }
      };

      auditResults.applications.push(appAudit);
    }

    // Ensure reports/audit directory exists
    const reportsAuditDir = path.join(__dirname, '..', 'reports', 'audit');
    if (!fs.existsSync(reportsAuditDir)) {
      fs.mkdirSync(reportsAuditDir, { recursive: true });
    }

    const jsonPath = path.join(reportsAuditDir, `audit-${targetEmail}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(auditResults, null, 2), 'utf8');
    console.log(`\nAudit JSON written to ${jsonPath}`);

    // Generate markdown summary
    const mdPath = path.join(reportsAuditDir, 'audit-data.md');
    let md = `# Audit Data for ${targetEmail}\n\n`;
    md += `**Audit Time:** ${auditResults.auditedAt}\n`;
    md += `**User:** ${user.name} (${user.email}, ID: \`${user._id}\`)\n\n`;

    for (const app of auditResults.applications) {
      md += `## Application: ${app.name}\n\n`;
      md += `- **ID:** \`${app.applicationId}\`\n`;
      md += `- **URL:** \`${app.url}\`\n`;
      md += `- **Application Status:** \`${app.currentAppStatus}\`\n`;
      md += `- **SLO Status:** \`${app.sloStatus || 'N/A'}\`\n`;
      if (!app.hasSlo && app.hasSlo === false) {
        md += `- **SLO:** None configured\n\n`;
        continue;
      }
      md += `- **Target:** ${app.sloConfig.targetPercent}%\n`;
      md += `- **Window:** ${app.sloConfig.windowDays} days\n\n`;

      md += `### Raw Counts in Rolling Window\n`;
      md += `- **Total:** ${app.rawCountsInWindow.total}\n`;
      md += `- **Good:** ${app.rawCountsInWindow.good}\n`;
      md += `- **Bad:** ${app.rawCountsInWindow.bad}\n`;
      md += `- **First Check:** ${app.timeline.firstCheckInWindow}\n`;
      md += `- **Last Check:** ${app.timeline.lastCheckInWindow}\n\n`;

      md += `### Status Code Breakdown\n`;
      md += `| Status Code | Count |\n| --- | --- |\n`;
      for (const [code, count] of Object.entries(app.statusCodeBreakdown)) {
        md += `| ${code} | ${count} |\n`;
      }
      md += `\n`;

      md += `### Error Type Breakdown\n`;
      md += `| Error Type | Count |\n| --- | --- |\n`;
      for (const [errType, count] of Object.entries(app.errorTypeBreakdown)) {
        md += `| ${errType} | ${count} |\n`;
      }
      md += `\n`;

      md += `### Rollup Drift Analysis\n`;
      md += `- **Raw Total:** ${app.rollupComparison.rawWindowTotal}\n`;
      md += `- **Hybrid Total (Boundary Raw + Daily Rollups):** ${app.rollupComparison.hybridTotal} (Boundary: ${app.rollupComparison.boundaryRawTotal}, Rollups: ${app.rollupComparison.rollupTotal})\n`;
      md += `- **Total Drift:** ${app.rollupComparison.drift.totalDiff}\n`;
      md += `- **Good Drift:** ${app.rollupComparison.drift.goodDiff}\n`;
      md += `- **Bad Drift:** ${app.rollupComparison.drift.badDiff}\n\n`;

      md += `### Independent Calculation vs API Result\n`;
      md += `| Metric | Independent | API | Difference |\n`;
      md += `| --- | --- | --- | --- |\n`;
      md += `| SLI (%) | ${app.comparison.sli.independent}% | ${app.comparison.sli.api}% | ${app.comparison.sli.diff} |\n`;
      md += `| Consumed (%) | ${app.comparison.budgetConsumedPct.independent}% | ${app.comparison.budgetConsumedPct.api}% | ${app.comparison.budgetConsumedPct.diff} |\n`;
      md += `| Remaining (%) | ${app.comparison.budgetRemainingPct.independent}% | ${app.comparison.budgetRemainingPct.api}% | ${app.comparison.budgetRemainingPct.diff} |\n`;
      md += `| Burn Rate 1h | ${app.comparison.burnRate1h.independent} | ${app.comparison.burnRate1h.api} | ${app.comparison.burnRate1h.diff} |\n`;
      md += `| Burn Rate 6h | ${app.comparison.burnRate6h.independent} | ${app.comparison.burnRate6h.api} | ${app.comparison.burnRate6h.diff} |\n`;
      md += `| Status | ${app.comparison.status.independent} | ${app.comparison.status.api} | ${app.comparison.status.matches ? 'MATCH' : 'MISMATCH'} |\n\n`;

      md += `### Data Integrity\n`;
      md += `- **Foreign Owner Checks:** ${app.integrity.foreignOwnerCount}\n`;
      md += `- **Future Checks:** ${app.integrity.futureCheckCount}\n`;
      md += `- **Duplicate Check Seconds:** ${app.integrity.duplicateSecondsCount} (Total excess checks: ${app.integrity.totalDuplicateChecks})\n\n`;

      if (app.specialDetails.incidentTimeline.length > 0) {
        md += `### Incident Timeline\n`;
        md += `| Incident ID | Status | Title | Severity | Failures | Started At | Resolved At | Duration (s) |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
        for (const inc of app.specialDetails.incidentTimeline) {
          md += `| \`${inc.id}\` | ${inc.status} | ${inc.title} | ${inc.severity} | ${inc.failureCount} | ${inc.startedAt} | ${inc.resolvedAt || 'active'} | ${inc.durationSeconds ?? 'N/A'} |\n`;
        }
        md += `\n`;
      }

      if (app.specialDetails.statusTransitions.length > 0) {
        md += `### Status Transitions (Consecutive Check Rule)\n`;
        for (const tr of app.specialDetails.statusTransitions) {
          md += `- **${tr.timestamp}:** ${tr.event} (${JSON.stringify(tr.triggerCheck)})\n`;
        }
        md += `\n`;
      }

      if (app.specialDetails.last30Checks.length > 0) {
        md += `### Last 30 Checks\n`;
        md += `| Timestamp | Status Code | Success | Response Time | Error Type |\n| --- | --- | --- | --- | --- |\n`;
        for (const chk of app.specialDetails.last30Checks) {
          md += `| ${chk.checkedAt} | ${chk.statusCode} | ${chk.success} | ${chk.responseTimeMs}ms | ${chk.errorType || 'none'} |\n`;
        }
        md += `\n`;
      }
    }

    fs.writeFileSync(mdPath, md, 'utf8');
    console.log(`Audit Markdown written to ${mdPath}`);

  } finally {
    await mongoose.disconnect();
  }
}

runAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
