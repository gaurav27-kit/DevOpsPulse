/**
 * services/sloRules.js
 *
 * Pure functions for Service Level Objective (SLO) calculations.
 * Contains zero database calls or side effects.
 *
 * Mathematical definitions:
 * - SLI = (good checks / total recorded checks) * 100
 * - Allowed Error Rate = (100 - targetPercent) / 100
 * - Error Budget Consumed % = (errorRate / allowedErrorRate) * 100
 * - Error Budget Remaining % = max(0, 100 - budgetConsumedPct)
 * - Burn Rate = (lookback error rate) / allowedErrorRate
 *
 * All operations use integer thousandths to prevent IEEE-754 floating-point drift.
 */

export const BURN_RATE_THRESHOLDS = Object.freeze({
  FAST_BURN: 14.4, // Burns 100% of 30-day budget in ~2 days (1 hr lookback)
  SLOW_BURN: 6.0   // Burns 100% of 30-day budget in 5 days (6 hr lookback)
});

/**
 * Computes core SLO metrics from check totals and target percent.
 *
 * @param {object} params
 * @param {number} params.good - Count of successful health checks
 * @param {number} params.total - Count of all recorded health checks in window
 * @param {number} params.targetPercent - Target reliability (e.g. 99.9)
 * @returns {object} { sli, errorRatePct, budgetConsumedPct, budgetRemainingPct, totals }
 */
export function computeSloStats({ good, total, targetPercent }) {
  const goodInt = Math.max(0, parseInt(good, 10) || 0);
  const totalInt = Math.max(0, parseInt(total, 10) || 0);
  const badInt = Math.max(0, totalInt - goodInt);

  if (!totalInt || totalInt < 20) {
    return {
      sli: null,
      errorRatePct: null,
      budgetConsumedPct: null,
      budgetRemainingPct: null,
      totals: { good: goodInt, bad: badInt, total: totalInt }
    };
  }

  const sli = Number(((goodInt / totalInt) * 100).toFixed(2));
  const errorRatePct = Number(((badInt / totalInt) * 100).toFixed(2));

  // Compute allowed error using integer thousandths to eliminate float noise (e.g. 99.9 -> 100)
  const targetMilli = Math.round(targetPercent * 1000);
  const allowedErrorMilli = 100000 - targetMilli;

  if (allowedErrorMilli <= 0) {
    return {
      sli,
      errorRatePct,
      budgetConsumedPct: badInt > 0 ? 100.0 : 0.0,
      budgetRemainingPct: badInt > 0 ? 0.0 : 100.0,
      totals: { good: goodInt, bad: badInt, total: totalInt }
    };
  }

  // budgetConsumedPct = (bad / total) / (allowedErrorMilli / 100000) * 100
  //                   = (bad * 10000000) / (total * allowedErrorMilli)
  const budgetConsumed = (badInt * 10000000) / (totalInt * allowedErrorMilli);
  const budgetConsumedPct = Number(budgetConsumed.toFixed(2));
  const budgetRemainingPct = Math.max(0, Number((100 - budgetConsumedPct).toFixed(2)));

  return {
    sli,
    errorRatePct,
    budgetConsumedPct,
    budgetRemainingPct,
    totals: { good: goodInt, bad: badInt, total: totalInt }
  };
}

/**
 * Classifies SLO health status based on budget consumed and sample size.
 *
 * @param {number|null} consumedPct - Percent of error budget consumed
 * @param {number|null} total - Total checks in evaluation window
 * @returns {"insufficient_data" | "healthy" | "at_risk" | "breached"}
 */
export function classifySlo(consumedPct, total) {
  if (total === null || total === undefined || total < 20) {
    return 'insufficient_data';
  }
  if (consumedPct === null || consumedPct === undefined) {
    return 'insufficient_data';
  }
  if (consumedPct < 50) {
    return 'healthy';
  }
  if (consumedPct >= 50 && consumedPct <= 100) {
    return 'at_risk';
  }
  return 'breached';
}

/**
 * Computes lookback burn rate: (observed error rate) / (allowed error rate).
 *
 * @param {number} bad - Failed checks in lookback window
 * @param {number} total - Total checks in lookback window
 * @param {number} targetPercent - SLO target percent
 * @returns {number|null} Burn rate rounded to 2 decimals, or null if no checks
 */
export function computeBurnRate(bad, total, targetPercent) {
  if (!total || total <= 0) {
    return null;
  }
  const badInt = Math.max(0, parseInt(bad, 10) || 0);
  const totalInt = Math.max(0, parseInt(total, 10) || 0);

  const targetMilli = Math.round(targetPercent * 1000);
  const allowedErrorMilli = 100000 - targetMilli;

  if (allowedErrorMilli <= 0) return 0;

  // burnRate = (bad / total) / (allowedErrorMilli / 100000)
  //          = (bad * 100000) / (total * allowedErrorMilli)
  const burnRate = (badInt * 100000) / (totalInt * allowedErrorMilli);
  return Number(burnRate.toFixed(2));
}

/**
 * Computes window historical coverage percent and partial window flag.
 *
 * @param {Date|string|null} firstCheckAt - Timestamp of first check in window
 * @param {Date|string} now - Current timestamp
 * @param {number} windowDays - Window duration in days (7 or 30)
 * @returns {{ coveragePct: number, partialWindow: boolean }}
 */
export function computeCoverage(firstCheckAt, now, windowDays) {
  if (!firstCheckAt) {
    return { coveragePct: 0, partialWindow: true };
  }

  const firstTime = new Date(firstCheckAt).getTime();
  const nowTime = new Date(now).getTime();
  const diffMs = Math.max(0, nowTime - firstTime);
  const daysOfData = diffMs / (1000 * 60 * 60 * 24);

  const coveragePct = Math.min(100, Number(((daysOfData / windowDays) * 100).toFixed(2)));
  const partialWindow = coveragePct < 50;

  return { coveragePct, partialWindow };
}

/**
 * Builds chronological daily burn-down series from UTC date buckets.
 * Empty days are preserved with total=0 and cumulative consumption carried forward.
 *
 * @param {Array<{ day: string, total: number, bad: number }>} dailyCounts
 * @param {Date|string} from - Window start date
 * @param {Date|string} to - Window end date
 * @param {number} targetPercent - SLO target percent
 * @param {number} totalInWindow - Total checks across full window
 * @returns {Array<{ day: string, total: number, bad: number, cumulativeBudgetConsumedPct: number|null }>}
 */
export function buildBurnDownSeries(dailyCounts, from, to, targetPercent, totalInWindow) {
  const dailyMap = new Map();
  if (Array.isArray(dailyCounts)) {
    for (const item of dailyCounts) {
      if (item && item.day) {
        dailyMap.set(item.day, {
          total: parseInt(item.total, 10) || 0,
          bad: parseInt(item.bad, 10) || 0
        });
      }
    }
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  // Normalize to UTC start-of-day
  const cur = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  const end = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()));

  const targetMilli = Math.round(targetPercent * 1000);
  const allowedErrorMilli = 100000 - targetMilli;
  const hasSufficientData = Boolean(totalInWindow && totalInWindow >= 20 && allowedErrorMilli > 0);

  const series = [];
  let runningBad = 0;
  let lastCumulative = hasSufficientData ? 0 : null;

  while (cur <= end) {
    const yyyy = cur.getUTCFullYear();
    const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    const dayStr = `${yyyy}-${mm}-${dd}`;

    const bucket = dailyMap.get(dayStr) || { total: 0, bad: 0 };
    runningBad += bucket.bad;

    let cumulativeBudgetConsumedPct = null;
    if (hasSufficientData) {
      // Evaluate cumulative bad against total window budget
      const cumConsumed = (runningBad * 10000000) / (totalInWindow * allowedErrorMilli);
      cumulativeBudgetConsumedPct = Number(cumConsumed.toFixed(2));
      lastCumulative = cumulativeBudgetConsumedPct;
    }

    series.push({
      day: dayStr,
      total: bucket.total,
      bad: bucket.bad,
      cumulativeBudgetConsumedPct
    });

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return series;
}
