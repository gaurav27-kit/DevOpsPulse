import mongoose from 'mongoose';
import { HealthCheck } from '../models/HealthCheck.js';
import { Application } from '../models/Application.js';
import { Incident } from '../models/Incident.js';
import { Deployment } from '../models/Deployment.js';
import { AppError } from '../utils/AppError.js';
import { resolveRange, computeUptimePercent, fillBuckets } from './analyticsRules.js';

// ─── Application uptime ───────────────────────────────────────────────────────

/**
 * Returns uptime summary + time-series for a single application.
 *
 * Uses ONE aggregation with $facet to avoid two round-trips:
 *   facet "summary" — $group totals and response time stats (successful only)
 *   facet "series"  — $dateTrunc bucketing + same stats per bucket
 *
 * Index used: { applicationId: 1, checkedAt: -1 }
 *
 * @param {ObjectId|string} ownerId
 * @param {string}          applicationId
 * @param {"24h"|"7d"|"30d"} range
 */
export async function getApplicationUptime(ownerId, applicationId, range) {
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new AppError('Application not found', 404);
  }

  // Verify ownership (404 for both non-existent and wrong-owner)
  const app = await Application.findOne({ _id: applicationId, ownerId }).lean();
  if (!app) throw new AppError('Application not found', 404);

  const { from, to, bucketUnit, label } = resolveRange(range);

  const [aggResult] = await HealthCheck.aggregate([
    {
      $match: {
        applicationId: new mongoose.Types.ObjectId(applicationId),
        checkedAt: { $gte: from, $lte: to }
      }
    },
    {
      $facet: {
        // Overall summary
        summary: [
          {
            $group: {
              _id: null,
              totalChecks: { $sum: 1 },
              successfulChecks: { $sum: { $cond: ['$success', 1, 0] } },
              // Response time stats from successful checks only
              avgResponseTimeMs: {
                $avg: { $cond: ['$success', '$responseTimeMs', null] }
              },
              minResponseTimeMs: {
                $min: { $cond: ['$success', '$responseTimeMs', null] }
              },
              maxResponseTimeMs: {
                $max: { $cond: ['$success', '$responseTimeMs', null] }
              }
            }
          }
        ],
        // Time-series bucketed by hour or day
        series: [
          {
            $group: {
              _id: {
                $dateTrunc: { date: '$checkedAt', unit: bucketUnit, timezone: 'UTC' }
              },
              totalChecks: { $sum: 1 },
              successfulChecks: { $sum: { $cond: ['$success', 1, 0] } },
              avgResponseTimeMs: {
                $avg: { $cond: ['$success', '$responseTimeMs', null] }
              }
            }
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              bucketStart: '$_id',
              totalChecks: 1,
              successfulChecks: 1,
              avgResponseTimeMs: { $round: ['$avgResponseTimeMs', 0] }
            }
          }
        ]
      }
    }
  ]);

  // Extract summary (empty array means no checks in range)
  const raw = aggResult.summary[0] ?? {
    totalChecks: 0,
    successfulChecks: 0,
    avgResponseTimeMs: null,
    minResponseTimeMs: null,
    maxResponseTimeMs: null
  };

  const summary = {
    totalChecks: raw.totalChecks,
    successfulChecks: raw.successfulChecks,
    failedChecks: raw.totalChecks - raw.successfulChecks,
    uptimePercent: computeUptimePercent(raw.successfulChecks, raw.totalChecks),
    avgResponseTimeMs: raw.avgResponseTimeMs != null ? Math.round(raw.avgResponseTimeMs) : null,
    minResponseTimeMs: raw.minResponseTimeMs ?? null,
    maxResponseTimeMs: raw.maxResponseTimeMs ?? null
  };

  // Add uptimePercent to each series bucket, then fill gaps with null-value entries
  const rawSeries = (aggResult.series ?? []).map((pt) => ({
    ...pt,
    uptimePercent: computeUptimePercent(pt.successfulChecks, pt.totalChecks)
  }));

  const series = fillBuckets(rawSeries, from, to, bucketUnit);

  return {
    summary,
    series,
    range: { from, to, label }
  };
}

// ─── Dashboard summary ────────────────────────────────────────────────────────

/**
 * Returns the full dashboard summary for the authenticated user.
 *
 * Runs independent queries in parallel (Promise.all) to minimise latency.
 *
 * Indexes used:
 *   Application: { ownerId } (single-field; covered by existing compound indexes)
 *   Incident: { ownerId, status, startedAt: -1 } (Step 6 index)
 *   HealthCheck: { ownerId: 1, checkedAt: -1 } (added this step)
 *   Deployment: { ownerId: 1, startedAt: -1 } (added this step)
 *
 * Per-application uptime is computed with ONE grouped aggregation over all
 * apps in the range (not a query per application), then merged in memory.
 *
 * @param {ObjectId|string} ownerId
 * @param {"24h"|"7d"|"30d"} range
 */
export async function getDashboardSummary(ownerId, range) {
  const { from, to, label } = resolveRange(range);
  const ownerObjId = new mongoose.Types.ObjectId(ownerId);

  // Run all independent queries in parallel
  const [
    allApps,
    activeIncidents,
    recentIncidents,
    recentDeployments,
    healthSummary,
    perAppHealth
  ] = await Promise.all([
    // 1. All user's applications (for byStatus counts + table)
    Application.find({ ownerId }, 'name url environment status lastCheckedAt').lean(),

    // 2. Active incidents with severity counts
    Incident.find({ ownerId, isActive: true }, 'severity applicationId').lean(),

    // 3. Last 5 incidents (any status) with application name
    Incident.find({ ownerId })
      .sort({ startedAt: -1 })
      .limit(5)
      .populate('applicationId', 'name')
      .lean(),

    // 4. Last 5 deployments with application name
    Deployment.find({ ownerId })
      .sort({ startedAt: -1 })
      .limit(5)
      .populate('applicationId', 'name')
      .lean(),

    // 5. Health summary across ALL user's checks in range (ONE aggregation)
    HealthCheck.aggregate([
      {
        $match: {
          ownerId: ownerObjId,
          checkedAt: { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: null,
          totalChecks: { $sum: 1 },
          successfulChecks: { $sum: { $cond: ['$success', 1, 0] } },
          avgResponseTimeMs: {
            $avg: { $cond: ['$success', '$responseTimeMs', null] }
          }
        }
      }
    ]),

    // 6. Per-application uptime in range (ONE grouped aggregation, not N queries)
    HealthCheck.aggregate([
      {
        $match: {
          ownerId: ownerObjId,
          checkedAt: { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: '$applicationId',
          totalChecks: { $sum: 1 },
          successfulChecks: { $sum: { $cond: ['$success', 1, 0] } }
        }
      }
    ])
  ]);

  // ── Applications section ──────────────────────────────────────────────────
  const byStatus = { unknown: 0, up: 0, degraded: 0, down: 0 };
  for (const app of allApps) {
    if (byStatus[app.status] !== undefined) byStatus[app.status]++;
  }

  // ── Incidents section ─────────────────────────────────────────────────────
  const activeBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const inc of activeIncidents) {
    if (activeBySeverity[inc.severity] !== undefined) activeBySeverity[inc.severity]++;
  }

  // ── Health section ────────────────────────────────────────────────────────
  const hs = healthSummary[0] ?? { totalChecks: 0, successfulChecks: 0, avgResponseTimeMs: null };
  const health = {
    totalChecks: hs.totalChecks,
    uptimePercent: computeUptimePercent(hs.successfulChecks, hs.totalChecks),
    avgResponseTimeMs: hs.avgResponseTimeMs != null ? Math.round(hs.avgResponseTimeMs) : null
  };

  // ── Per-app uptime lookup map ─────────────────────────────────────────────
  const uptimeMap = new Map();
  for (const row of perAppHealth) {
    uptimeMap.set(
      row._id.toString(),
      computeUptimePercent(row.successfulChecks, row.totalChecks)
    );
  }

  // ── applicationsTable: sorted down → degraded → unknown → up, then by name ─
  const STATUS_ORDER = { down: 0, degraded: 1, unknown: 2, up: 3 };
  const applicationsTable = allApps
    .sort((a, b) => {
      const diff = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    })
    .slice(0, 10)
    .map((app) => ({
      id: app._id,
      name: app.name,
      url: app.url,
      environment: app.environment,
      status: app.status,
      lastCheckedAt: app.lastCheckedAt,
      uptimePercent: uptimeMap.get(app._id.toString()) ?? null
    }));

  return {
    applications: {
      total: allApps.length,
      byStatus
    },
    incidents: {
      activeCount: activeIncidents.length,
      activeBySeverity,
      recent: recentIncidents
    },
    deployments: {
      recent: recentDeployments
    },
    health,
    applicationsTable,
    range: { from, to, label }
  };
}

