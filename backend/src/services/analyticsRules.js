/**
 * Pure analytics utility functions. NO database access, NO side effects.
 * All functions are exported for unit testing.
 *
 * ── Uptime Definition ────────────────────────────────────────────────────────
 * uptime % = successful checks / all recorded checks in the window.
 *
 * Rules:
 *  - Every recorded check counts. A timeout counts as failed. A connection error counts as failed.
 *  - Slow-but-successful checks (status 200 but over SLOW_RESPONSE_MS) count as SUCCESSFUL.
 *  - Periods with NO checks are NOT counted as up or down: uptimePercent is null ("no data"),
 *    not 0%. Returning 0% for no-data would mislead users into thinking the site was fully down.
 *  - Average, min and max response time are computed from SUCCESSFUL checks only,
 *    because failed checks have no meaningful response body time to report.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Resolves a named time range into concrete from/to dates and a bucket unit.
 *
 * @param {"24h"|"7d"|"30d"} range - Named range
 * @param {Date} [now]             - Reference point (defaults to now; injectable for tests)
 * @returns {{ from: Date, to: Date, bucketUnit: "hour"|"day", label: string }}
 * @throws {Error} if range is not one of the three valid values
 */
export function resolveRange(range, now = new Date()) {
  const to = new Date(now);

  switch (range) {
    case '24h':
      return {
        from: new Date(to.getTime() - 24 * 60 * 60 * 1000),
        to,
        bucketUnit: 'hour',
        label: 'Last 24 hours'
      };
    case '7d':
      return {
        from: new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000),
        to,
        bucketUnit: 'day',
        label: 'Last 7 days'
      };
    case '30d':
      return {
        from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000),
        to,
        bucketUnit: 'day',
        label: 'Last 30 days'
      };
    default:
      throw new Error(`Invalid range "${range}". Must be one of: 24h, 7d, 30d`);
  }
}

/**
 * Computes uptime percentage, returning null when there is no data.
 *
 * Returns null (not 0) when totalChecks is 0: "no data" is not the same as "fully down".
 *
 * @param {number} successfulChecks - Number of successful checks in the window
 * @param {number} totalChecks      - Total checks in the window (0 means no data)
 * @returns {number|null}           - Percentage rounded to 2 decimal places, or null
 */
export function computeUptimePercent(successfulChecks, totalChecks) {
  if (totalChecks === 0) return null;
  const pct = (successfulChecks / totalChecks) * 100;
  return Math.round(pct * 100) / 100; // round to 2 decimals
}

/**
 * Fills a time-series array with one entry per bucket between `from` and `to`,
 * inserting null-value entries for buckets that have no data.
 *
 * Empty buckets use null (not zero) so that charts can display data gaps
 * rather than falsely showing 100% or 0% uptime during uninstrumented periods.
 *
 * @param {Array<{bucketStart: Date, totalChecks: number, successfulChecks: number,
 *                uptimePercent: number|null, avgResponseTimeMs: number|null}>} points
 *          - Raw data points from the aggregation (one per bucket that has data)
 * @param {Date}           from       - Range start (inclusive)
 * @param {Date}           to         - Range end (inclusive)
 * @param {"hour"|"day"}   unit       - Bucket size
 * @returns {Array}                   - Complete series with one entry per bucket
 */
export function fillBuckets(points, from, to, unit) {
  const stepMs = unit === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  // Index existing points by their UTC bucket start (truncated to unit boundary)
  const indexed = new Map();
  for (const pt of points) {
    const key = truncateToBucket(new Date(pt.bucketStart), unit).getTime();
    indexed.set(key, pt);
  }

  const result = [];
  // Walk from the first bucket boundary <= `from` to `to`
  let cursor = truncateToBucket(new Date(from), unit);

  while (cursor <= to) {
    const key = cursor.getTime();
    if (indexed.has(key)) {
      result.push(indexed.get(key));
    } else {
      // Empty bucket: use null values (not zeros) to indicate no data
      result.push({
        bucketStart: new Date(cursor),
        totalChecks: 0,
        successfulChecks: 0,
        uptimePercent: null,
        avgResponseTimeMs: null
      });
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return result;
}

/**
 * Truncates a Date to the start of its bucket (hour or day) in UTC.
 * @param {Date}           date
 * @param {"hour"|"day"}   unit
 * @returns {Date}
 */
export function truncateToBucket(date, unit) {
  const d = new Date(date);
  if (unit === 'hour') {
    d.setUTCMinutes(0, 0, 0);
  } else {
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

