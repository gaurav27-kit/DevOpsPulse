import mongoose from 'mongoose';
import { Slo } from '../models/Slo.js';
import { Application } from '../models/Application.js';
import { HealthCheck } from '../models/HealthCheck.js';
import { AppError } from '../utils/AppError.js';
import {
  computeSloStats,
  classifySlo,
  computeBurnRate,
  computeCoverage,
  buildBurnDownSeries,
  BURN_RATE_THRESHOLDS
} from './sloRules.js';

const MAX_SLOS_PER_ACCOUNT = 20;

/**
 * Verifies application exists and is owned by the specified user.
 * Throws 404 if application not found or owned by another user (tenant isolation).
 */
async function verifyApplicationOwnership(applicationId, ownerId) {
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new AppError('Application not found', 404);
  }
  const app = await Application.findOne({ _id: applicationId, ownerId }).lean();
  if (!app) {
    throw new AppError('Application not found', 404);
  }
  return app;
}

/**
 * Creates an SLO for the specified application.
 */
export async function createSlo(ownerId, applicationId, data) {
  await verifyApplicationOwnership(applicationId, ownerId);

  // Enforce account-level SLO capacity limit
  const userSloCount = await Slo.countDocuments({ ownerId });
  if (userSloCount >= MAX_SLOS_PER_ACCOUNT) {
    throw new AppError('Maximum of 20 SLOs allowed per account', 409);
  }

  // Enforce 1 SLO per application limit
  const existingSlo = await Slo.findOne({ applicationId });
  if (existingSlo) {
    throw new AppError('This application already has an SLO', 409);
  }

  const slo = await Slo.create({
    ownerId,
    applicationId,
    name: data.name,
    targetPercent: data.targetPercent,
    windowDays: data.windowDays
  });

  return slo;
}

/**
 * Retrieves the SLO and evaluated reliability metrics for an application.
 */
export async function getSloForApplication(ownerId, applicationId) {
  await verifyApplicationOwnership(applicationId, ownerId);

  const slo = await Slo.findOne({ applicationId, ownerId }).lean();
  if (!slo) {
    throw new AppError('SLO not found for this application', 404);
  }

  const to = new Date();
  const from = new Date(to.getTime() - slo.windowDays * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(to.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(to.getTime() - 6 * 60 * 60 * 1000);

  // Aggregation leverages compound index { applicationId: 1, checkedAt: -1 }
  const [aggResult] = await HealthCheck.aggregate([
    {
      $match: {
        applicationId: new mongoose.Types.ObjectId(applicationId),
        checkedAt: { $gte: from, $lte: to }
      }
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              good: { $sum: { $cond: ['$success', 1, 0] } },
              bad: { $sum: { $cond: ['$success', 0, 1] } },
              firstCheckAt: { $min: '$checkedAt' }
            }
          }
        ],
        burn1h: [
          {
            $match: { checkedAt: { $gte: oneHourAgo } }
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              bad: { $sum: { $cond: ['$success', 0, 1] } }
            }
          }
        ],
        burn6h: [
          {
            $match: { checkedAt: { $gte: sixHoursAgo } }
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              bad: { $sum: { $cond: ['$success', 0, 1] } }
            }
          }
        ],
        daily: [
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$checkedAt', timezone: 'UTC' }
              },
              total: { $sum: 1 },
              bad: { $sum: { $cond: ['$success', 0, 1] } }
            }
          },
          {
            $sort: { _id: 1 }
          }
        ]
      }
    }
  ]);

  const totalsRaw = aggResult?.totals?.[0] || { total: 0, good: 0, bad: 0, firstCheckAt: null };
  const burn1hRaw = aggResult?.burn1h?.[0] || { total: 0, bad: 0 };
  const burn6hRaw = aggResult?.burn6h?.[0] || { total: 0, bad: 0 };
  const dailyRaw = aggResult?.daily || [];

  const stats = computeSloStats({
    good: totalsRaw.good,
    total: totalsRaw.total,
    targetPercent: slo.targetPercent
  });

  const status = classifySlo(stats.budgetConsumedPct, totalsRaw.total);
  const coverage = computeCoverage(totalsRaw.firstCheckAt, to, slo.windowDays);

  const burnRate1h = computeBurnRate(burn1hRaw.bad, burn1hRaw.total, slo.targetPercent);
  const burnRate6h = computeBurnRate(burn6hRaw.bad, burn6hRaw.total, slo.targetPercent);

  const fastBurn = Boolean(burnRate1h !== null && burnRate1h >= BURN_RATE_THRESHOLDS.FAST_BURN);
  const slowBurn = Boolean(burnRate6h !== null && burnRate6h >= BURN_RATE_THRESHOLDS.SLOW_BURN);

  const dailyCounts = dailyRaw.map((item) => ({
    day: item._id,
    total: item.total,
    bad: item.bad
  }));

  const series = buildBurnDownSeries(
    dailyCounts,
    from,
    to,
    slo.targetPercent,
    totalsRaw.total
  );

  return {
    slo,
    status,
    sli: stats.sli,
    errorRatePct: stats.errorRatePct,
    budgetConsumedPct: stats.budgetConsumedPct,
    budgetRemainingPct: stats.budgetRemainingPct,
    totals: stats.totals,
    coveragePct: coverage.coveragePct,
    partialWindow: coverage.partialWindow,
    burnRate1h,
    burnRate6h,
    fastBurn,
    slowBurn,
    series,
    window: {
      from: from.toISOString(),
      to: to.toISOString()
    }
  };
}

/**
 * Updates an SLO definition.
 */
export async function updateSlo(ownerId, applicationId, data) {
  await verifyApplicationOwnership(applicationId, ownerId);

  const slo = await Slo.findOne({ applicationId, ownerId });
  if (!slo) {
    throw new AppError('SLO not found for this application', 404);
  }

  if (data.name !== undefined) slo.name = data.name;
  if (data.targetPercent !== undefined) slo.targetPercent = data.targetPercent;
  if (data.windowDays !== undefined) slo.windowDays = data.windowDays;

  await slo.save();
  return slo;
}

/**
 * Deletes an SLO definition.
 */
export async function deleteSlo(ownerId, applicationId) {
  await verifyApplicationOwnership(applicationId, ownerId);

  const slo = await Slo.findOneAndDelete({ applicationId, ownerId });
  if (!slo) {
    throw new AppError('SLO not found for this application', 404);
  }

  return { deleted: true };
}

/**
 * Lists user's SLOs with computed reliability summary stats.
 * Uses a single grouped aggregation query across application IDs to eliminate N+1 queries.
 */
export async function listSlos(ownerId, query = {}) {
  const sortBy = query.sortBy || 'createdAt';
  if (sortBy === 'budgetConsumedPct' || !['createdAt', 'name'].includes(sortBy)) {
    throw new AppError(
      'Sorting by computed metrics is not supported. Use createdAt or name',
      400
    );
  }

  const order = query.order === 'asc' ? 1 : -1;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const statusFilter = query.status || null;

  // Fetch user's SLOs (up to 20 maximum per account owner)
  const userSlos = await Slo.find({ ownerId })
    .sort({ [sortBy]: order })
    .populate('applicationId', 'name')
    .lean();

  if (userSlos.length === 0) {
    return {
      slos: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      }
    };
  }

  const appIds = userSlos.map((s) => s.applicationId?._id || s.applicationId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  // Single aggregation computing stats across all applications in 1 round trip
  const statsAgg = await HealthCheck.aggregate([
    {
      $match: {
        applicationId: { $in: appIds.map((id) => new mongoose.Types.ObjectId(id)) },
        checkedAt: { $gte: thirtyDaysAgo, $lte: now }
      }
    },
    {
      $group: {
        _id: '$applicationId',
        total30d: { $sum: 1 },
        good30d: { $sum: { $cond: ['$success', 1, 0] } },
        firstCheckAt30d: { $min: '$checkedAt' },

        total7d: { $sum: { $cond: [{ $gte: ['$checkedAt', sevenDaysAgo] }, 1, 0] } },
        good7d: { $sum: { $cond: [{ $and: [{ $gte: ['$checkedAt', sevenDaysAgo] }, '$success'] }, 1, 0] } },
        firstCheckAt7d: { $min: { $cond: [{ $gte: ['$checkedAt', sevenDaysAgo] }, '$checkedAt', null] } },

        total1h: { $sum: { $cond: [{ $gte: ['$checkedAt', oneHourAgo] }, 1, 0] } },
        bad1h: { $sum: { $cond: [{ $and: [{ $gte: ['$checkedAt', oneHourAgo] }, { $not: '$success' }] }, 1, 0] } },

        total6h: { $sum: { $cond: [{ $gte: ['$checkedAt', sixHoursAgo] }, 1, 0] } },
        bad6h: { $sum: { $cond: [{ $and: [{ $gte: ['$checkedAt', sixHoursAgo] }, { $not: '$success' }] }, 1, 0] } }
      }
    }
  ]);

  const statsMap = new Map();
  for (const s of statsAgg) {
    statsMap.set(String(s._id), s);
  }

  const enrichedSlos = userSlos.map((slo) => {
    const appIdStr = String(slo.applicationId?._id || slo.applicationId);
    const agg = statsMap.get(appIdStr);

    const is7d = slo.windowDays === 7;
    const total = is7d ? agg?.total7d || 0 : agg?.total30d || 0;
    const good = is7d ? agg?.good7d || 0 : agg?.good30d || 0;
    const firstCheckAt = is7d ? agg?.firstCheckAt7d || null : agg?.firstCheckAt30d || null;

    const stats = computeSloStats({ good, total, targetPercent: slo.targetPercent });
    const status = classifySlo(stats.budgetConsumedPct, total);
    const coverage = computeCoverage(firstCheckAt, now, slo.windowDays);

    const burn1hTotal = agg?.total1h || 0;
    const burn1hBad = agg?.bad1h || 0;
    const burn6hTotal = agg?.total6h || 0;
    const burn6hBad = agg?.bad6h || 0;

    const burnRate1h = computeBurnRate(burn1hBad, burn1hTotal, slo.targetPercent);
    const burnRate6h = computeBurnRate(burn6hBad, burn6hTotal, slo.targetPercent);

    const fastBurn = Boolean(burnRate1h !== null && burnRate1h >= BURN_RATE_THRESHOLDS.FAST_BURN);
    const slowBurn = Boolean(burnRate6h !== null && burnRate6h >= BURN_RATE_THRESHOLDS.SLOW_BURN);

    return {
      slo: {
        _id: slo._id,
        applicationId: slo.applicationId?._id || slo.applicationId,
        name: slo.name,
        targetPercent: slo.targetPercent,
        windowDays: slo.windowDays,
        createdAt: slo.createdAt,
        updatedAt: slo.updatedAt
      },
      application: {
        _id: slo.applicationId?._id || slo.applicationId,
        name: slo.applicationId?.name || 'Unknown Application'
      },
      status,
      sli: stats.sli,
      errorRatePct: stats.errorRatePct,
      budgetConsumedPct: stats.budgetConsumedPct,
      budgetRemainingPct: stats.budgetRemainingPct,
      totals: stats.totals,
      coveragePct: coverage.coveragePct,
      partialWindow: coverage.partialWindow,
      burnRate1h,
      burnRate6h,
      fastBurn,
      slowBurn
    };
  });

  const filteredSlos = statusFilter
    ? enrichedSlos.filter((item) => item.status === statusFilter)
    : enrichedSlos;

  const total = filteredSlos.length;
  const totalPages = Math.ceil(total / limit);
  const pagedSlos = filteredSlos.slice((page - 1) * limit, page * limit);

  return {
    slos: pagedSlos,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

