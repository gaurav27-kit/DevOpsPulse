/**
 * Utility functions for formatting SLO numbers, percentages, chart ticks,
 * and large-value plain-language annotations.
 */

/**
 * Formats a percentage value with thousands separators and specified decimal places.
 * e.g. 81671.2 -> "81,671.2%"
 */
export function formatPercentage(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const num = Number(value);
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}%`;
}

/**
 * Formats y-axis ticks compactly so large percentages don't clip.
 * e.g.:
 *   0     -> "0%"
 *   100   -> "100%"
 *   1500  -> "1.5k%"
 *   80000 -> "80k%"
 */
export function formatCompactTick(val) {
  if (val === null || val === undefined || isNaN(val)) return '';
  const num = Number(val);
  if (num === 0) return '0%';
  if (Math.abs(num) >= 1000) {
    const k = num / 1000;
    const formatted = Number.isInteger(k) ? k : Number(k.toFixed(1));
    return `${formatted}k%`;
  }
  return `${num}%`;
}

/**
 * Clamps the chart's y-axis domain to a maximum of 200%
 * (or 1.5 x the largest value below 200, minimum 150%).
 * e.g.:
 *   0     -> 150
 *   80    -> 150
 *   150   -> 200
 *   81671 -> 200
 */
export function computeYAxisDomainMax(maxConsumed) {
  const maxVal = typeof maxConsumed === 'number' && !isNaN(maxConsumed) ? maxConsumed : 0;
  return Math.min(200, Math.max(150, Math.ceil(maxVal * 1.5)));
}

/**
 * Returns a plain-language explanation when budgetConsumedPct > 1000:
 * "Budget exhausted: failures were N times the allowed amount"
 * (N = consumed / 100, one decimal, with separators).
 * Returns null if consumed <= 1000 or invalid.
 * e.g.:
 *   81671.2 -> "Budget exhausted: failures were 816.7 times the allowed amount"
 *   999.9   -> null
 */
export function getExhaustedBudgetNote(consumed) {
  if (typeof consumed !== 'number' || isNaN(consumed) || consumed <= 1000) {
    return null;
  }
  const n = (consumed / 100).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  return `Budget exhausted: failures were ${n} times the allowed amount`;
}

/**
 * Generates the capped note text when maximum series value exceeds domain cap.
 * e.g. "Chart capped at 200%. Actual maximum: 81,671%"
 */
export function getCappedChartNote(cap, actualMax) {
  if (typeof actualMax !== 'number' || isNaN(actualMax) || actualMax <= cap) {
    return null;
  }
  const formattedActual = Math.round(actualMax).toLocaleString('en-US');
  return `Chart capped at ${cap}%. Actual maximum: ${formattedActual}%`;
}
