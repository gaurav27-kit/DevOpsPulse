/**
 * backend/src/services/sloService.js
 *
 * Service layer for Service Level Objective (SLO) definitions and evaluation.
 *
 * Performance architecture (Step 15b):
 * Uses HealthCheckDaily aggregated rollup collections to eliminate full raw table
 * scans over hundreds of thousands of documents. Boundary partial day is queried
 * from raw HealthCheck [windowStart, endOfBoundaryDay); all full days are summed
 * from HealthCheckDaily. Burn rates (1h, 6h lookback) query indexed raw records.
 */

import mongoose from 'mongoose';
import { Slo } from '../models/Slo.js';
import { Application } from '../models/Application.js';
import { HealthCheck } from '../models/HealthCheck.js';
import { HealthCheckDaily } from '../models/HealthCheckDaily.js';
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

let warnedRollupFallback = false;

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
 * Raw fallback evaluation for an application SLO.
 * Scans every raw HealthCheck document. Retained for equivalence verification and fallback.
 */
export async function getSloForApplicationRaw(ownerId, applicationId, existingSlo = null) {
  if (!existingSlo) {
    await verifyApplicationOwnership(applicationId, ownerId);
  }

  const slo = existingSlo || (await Slo.findOne({ applicationId, ownerId }).lean());
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
 * Retrieves the SLO and evaluated reliability metrics for an application.
 * Utilizes HealthCheckDaily rollups for complete calendar days, querying raw
 * records only for the boundary partial day and short lookback burn rates.
 */
export async function getSloForApplication(ownerId, applicationId) {
  await verifyApplicationOwnership(applicationId, ownerId);

  const slo = await Slo.findOne({ applicationId, ownerId }).lean();
  if (!slo) {
    throw new AppError('SLO not found for this application', 404);
  }

  const appObjId = new mongoose.Types.ObjectId(applicationId);

  // Fallback check: if no rollups exist for this app but raw checks do exist, fall back to raw
  const rollupExists = await HealthCheckDaily.exists({ applicationId: appObjId });
  if (!rollupExists) {
    const rawExists = await HealthCheck.exists({ applicationId: appObjId });
    if (rawExists) {
      if (!warnedRollupFallback) {
        console.warn('[sloService] HealthCheckDaily empty; falling back to raw HealthCheck aggregation');
        warnedRollupFallback = true;
      }
      return getSloForApplicationRaw(ownerId, applicationId, slo);
    }
  }

  const to = new Date();
  const from = new Date(to.getTime() - slo.windowDays * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(to.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(to.getTime() - 6 * 60 * 60 * 1000);

  // Calculate UTC calendar day boundaries
  const startOfFromDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const endOfFromDay = new Date(startOfFromDay.getTime() + 24 * 60 * 60 * 1000);
  const startOfToDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  // 1. Boundary raw query: covers checks on the initial partial day [from, endOfFromDay)
  // 2. Burn rates query: covers short lookbacks (1h and 6h) from raw HealthCheck
  // 3. Rollup query: sums all full days [endOfFromDay, startOfToDay] from HealthCheckDaily
  const [boundaryRawArr, burnRawArr, rollups] = await Promise.all([
    HealthCheck.aggregate([
      {
        $match: {
          applicationId: appObjId,
          checkedAt: { $gte: from, $lt: endOfFromDay }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          good: { $sum: { $cond: ['$success', 1, 0] } },
          bad: { $sum: { $cond: ['$success', 0, 1] } },
          firstCheckAt: { $min: '$checkedAt' }
        }
      }
    ]),
    HealthCheck.aggregate([
      {
        $match: {
          applicationId: appObjId,
          checkedAt: { $gte: sixHoursAgo, $lte: to }
        }
      },
      {
        $facet: {
          burn1h: [
            { $match: { checkedAt: { $gte: oneHourAgo } } },
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
              $group: {
                _id: null,
                total: { $sum: 1 },
                bad: { $sum: { $cond: ['$success', 0, 1] } }
              }
            }
          ]
        }
      }
    ]),
    HealthCheckDaily.find({
      applicationId: appObjId,
      day: { $gte: endOfFromDay, $lte: startOfToDay }
    })
      .sort({ day: 1 })
      .lean()
  ]);

  const boundaryRaw = boundaryRawArr[0] || { total: 0, good: 0, bad: 0, firstCheckAt: null };
  const burn1hRaw = burnRawArr[0]?.burn1h?.[0] || { total: 0, bad: 0 };
  const burn6hRaw = burnRawArr[0]?.burn6h?.[0] || { total: 0, bad: 0 };

  // Combine boundary raw counts with rollup counts
  let rollupTotal = 0;
  let rollupGood = 0;
  for (const r of rollups) {
    rollupTotal += r.total;
    rollupGood += r.good;
  }

  const total = boundaryRaw.total + rollupTotal;
  const good = boundaryRaw.good + rollupGood;
  const bad = boundaryRaw.bad + (rollupTotal - rollupGood);

  // Compute firstCheckAt accurately for coverage
  let firstCheckAt = boundaryRaw.firstCheckAt;
  if (!firstCheckAt && total > 0) {
    const earliest = await HealthCheck.findOne(
      {
        applicationId: appObjId,
        checkedAt: { $gte: from, $lte: to }
      },
      { checkedAt: 1 }
    )
      .sort({ checkedAt: 1 })
      .lean();
    firstCheckAt = earliest?.checkedAt || null;
  }

  const stats = computeSloStats({
    good,
    total,
    targetPercent: slo.targetPercent
  });

  const status = classifySlo(stats.budgetConsumedPct, total);
  const coverage = computeCoverage(firstCheckAt, to, slo.windowDays);

  const burnRate1h = computeBurnRate(burn1hRaw.bad, burn1hRaw.total, slo.targetPercent);
  const burnRate6h = computeBurnRate(burn6hRaw.bad, burn6hRaw.total, slo.targetPercent);

  const fastBurn = Boolean(burnRate1h !== null && burnRate1h >= BURN_RATE_THRESHOLDS.FAST_BURN);
  const slowBurn = Boolean(burnRate6h !== null && burnRate6h >= BURN_RATE_THRESHOLDS.SLOW_BURN);

  // Construct chronological daily counts map for series generator
  const dailyCountsMap = new Map();

  // If boundary day had checks, add its partial-day counts
  if (boundaryRaw.total > 0 || boundaryRaw.bad > 0) {
    const yyyy = startOfFromDay.getUTCFullYear();
    const mm = String(startOfFromDay.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(startOfFromDay.getUTCDate()).padStart(2, '0');
    const day0Str = `${yyyy}-${mm}-${dd}`;
    dailyCountsMap.set(day0Str, {
      day: day0Str,
      total: boundaryRaw.total,
      bad: boundaryRaw.bad
    });
  }

  // Populate counts from daily rollups
  for (const r of rollups) {
    const d = new Date(r.day);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dayStr = `${yyyy}-${mm}-${dd}`;

    const existing = dailyCountsMap.get(dayStr) || { day: dayStr, total: 0, bad: 0 };
    existing.total += r.total;
    existing.bad += (r.total - r.good);
    dailyCountsMap.set(dayStr, existing);
  }

  const dailyCounts = Array.from(dailyCountsMap.values());

  const series = buildBurnDownSeries(
    dailyCounts,
    from,
    to,
    slo.targetPercent,
    total
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
 * Raw fallback evaluation for listing SLOs across applications.
 * Scans every raw HealthCheck document. Retained for fallback and equivalence proofs.
 */
export async function listSlosRaw(ownerId, query = {}, preloadedSlos = null) {
  const sortBy = query.sortBy || 'createdAt';
  const order = query.order === 'asc' ? 1 : -1;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const statusFilter = query.status || null;

  const userSlos =
    preloadedSlos ||
    (await Slo.find({ ownerId })
      .sort({ [sortBy]: order })
      .populate('applicationId', 'name')
      .lean());

  if (userSlos.length === 0) {
    return {
      slos: [],
      pagination: { page, limit, total: 0, totalPages: 0 }
    };
  }

  const appIds = userSlos.map((s) => s.applicationId?._id || s.applicationId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

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
    pagination: { page, limit, total, totalPages }
  };
}

/**
 * Lists user's SLOs with computed reliability summary stats.
 * Uses grouped aggregation over HealthCheckDaily rollups across application IDs,
 * combined with short-interval raw scans for boundary days and burn rates.
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
  const appObjIds = appIds.map((id) => new mongoose.Types.ObjectId(id));

  // Check fallback: if no rollups exist for any of these apps, check if raw checks exist
  const rollupCount = await HealthCheckDaily.countDocuments({
    applicationId: { $in: appObjIds }
  });

  if (rollupCount === 0) {
    const rawCount = await HealthCheck.countDocuments({
      applicationId: { $in: appObjIds }
    });
    if (rawCount > 0) {
      if (!warnedRollupFallback) {
        console.warn('[sloService] HealthCheckDaily empty; falling back to raw HealthCheck aggregation in listSlos');
        warnedRollupFallback = true;
      }
      return listSlosRaw(ownerId, query, userSlos);
    }
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const startOf30dFrom = new Date(Date.UTC(thirtyDaysAgo.getUTCFullYear(), thirtyDaysAgo.getUTCMonth(), thirtyDaysAgo.getUTCDate()));
  const endOf30dFrom = new Date(startOf30dFrom.getTime() + 24 * 60 * 60 * 1000);
  const startOf7dFrom = new Date(Date.UTC(sevenDaysAgo.getUTCFullYear(), sevenDaysAgo.getUTCMonth(), sevenDaysAgo.getUTCDate()));
  const endOf7dFrom = new Date(startOf7dFrom.getTime() + 24 * 60 * 60 * 1000);

  // Run rollups aggregation, boundary raw aggregation, and burn rate lookbacks in parallel
  const [rollupsAgg, boundaryAgg, burnAgg] = await Promise.all([
    HealthCheckDaily.aggregate([
      {
        $match: {
          applicationId: { $in: appObjIds },
          day: { $gte: endOf30dFrom }
        }
      },
      {
        $group: {
          _id: '$applicationId',
          total30d: { $sum: '$total' },
          good30d: { $sum: '$good' },
          total7d: {
            $sum: { $cond: [{ $gte: ['$day', endOf7dFrom] }, '$total', 0] }
          },
          good7d: {
            $sum: { $cond: [{ $gte: ['$day', endOf7dFrom] }, '$good', 0] }
          }
        }
      }
    ]),
    HealthCheck.aggregate([
      {
        $match: {
          applicationId: { $in: appObjIds },
          $or: [
            { checkedAt: { $gte: thirtyDaysAgo, $lt: endOf30dFrom } },
            { checkedAt: { $gte: sevenDaysAgo, $lt: endOf7dFrom } }
          ]
        }
      },
      {
        $group: {
          _id: '$applicationId',
          bTotal30d: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$checkedAt', thirtyDaysAgo] }, { $lt: ['$checkedAt', endOf30dFrom] }] },
                1,
                0
              ]
            }
          },
          bGood30d: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$checkedAt', thirtyDaysAgo] },
                    { $lt: ['$checkedAt', endOf30dFrom] },
                    '$success'
                  ]
                },
                1,
                0
              ]
            }
          },
          bFirst30d: {
            $min: {
              $cond: [
                { $and: [{ $gte: ['$checkedAt', thirtyDaysAgo] }, { $lt: ['$checkedAt', endOf30dFrom] }] },
                '$checkedAt',
                null
              ]
            }
          },
          bTotal7d: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$checkedAt', sevenDaysAgo] }, { $lt: ['$checkedAt', endOf7dFrom] }] },
                1,
                0
              ]
            }
          },
          bGood7d: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$checkedAt', sevenDaysAgo] },
                    { $lt: ['$checkedAt', endOf7dFrom] },
                    '$success'
                  ]
                },
                1,
                0
              ]
            }
          },
          bFirst7d: {
            $min: {
              $cond: [
                { $and: [{ $gte: ['$checkedAt', sevenDaysAgo] }, { $lt: ['$checkedAt', endOf7dFrom] }] },
                '$checkedAt',
                null
              ]
            }
          }
        }
      }
    ]),
    HealthCheck.aggregate([
      {
        $match: {
          applicationId: { $in: appObjIds },
          checkedAt: { $gte: sixHoursAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: '$applicationId',
          total1h: { $sum: { $cond: [{ $gte: ['$checkedAt', oneHourAgo] }, 1, 0] } },
          bad1h: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$checkedAt', oneHourAgo] }, { $not: '$success' }] }, 1, 0]
            }
          },
          total6h: { $sum: 1 },
          bad6h: { $sum: { $cond: ['$success', 0, 1] } }
        }
      }
    ])
  ]);

  const rollupsMap = new Map();
  for (const r of rollupsAgg) rollupsMap.set(String(r._id), r);

  const boundaryMap = new Map();
  for (const b of boundaryAgg) boundaryMap.set(String(b._id), b);

  const burnMap = new Map();
  for (const bu of burnAgg) burnMap.set(String(bu._id), bu);

  // Enriched SLOs with combined counts
  const enrichedSlos = await Promise.all(
    userSlos.map(async (slo) => {
      const appIdStr = String(slo.applicationId?._id || slo.applicationId);
      const is7d = slo.windowDays === 7;

      const r = rollupsMap.get(appIdStr);
      const b = boundaryMap.get(appIdStr);
      const bu = burnMap.get(appIdStr);

      const rTotal = is7d ? r?.total7d || 0 : r?.total30d || 0;
      const rGood = is7d ? r?.good7d || 0 : r?.good30d || 0;

      const bTotal = is7d ? b?.bTotal7d || 0 : b?.bTotal30d || 0;
      const bGood = is7d ? b?.bGood7d || 0 : b?.bGood30d || 0;

      const total = rTotal + bTotal;
      const good = rGood + bGood;

      let firstCheckAt = is7d ? b?.bFirst7d || null : b?.bFirst30d || null;
      if (!firstCheckAt && total > 0) {
        const windowFrom = is7d ? sevenDaysAgo : thirtyDaysAgo;
        const earliest = await HealthCheck.findOne(
          {
            applicationId: new mongoose.Types.ObjectId(appIdStr),
            checkedAt: { $gte: windowFrom, $lte: now }
          },
          { checkedAt: 1 }
        )
          .sort({ checkedAt: 1 })
          .lean();
        firstCheckAt = earliest?.checkedAt || null;
      }

      const stats = computeSloStats({ good, total, targetPercent: slo.targetPercent });
      const status = classifySlo(stats.budgetConsumedPct, total);
      const coverage = computeCoverage(firstCheckAt, now, slo.windowDays);

      const burn1hTotal = bu?.total1h || 0;
      const burn1hBad = bu?.bad1h || 0;
      const burn6hTotal = bu?.total6h || 0;
      const burn6hBad = bu?.bad6h || 0;

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
    })
  );

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
