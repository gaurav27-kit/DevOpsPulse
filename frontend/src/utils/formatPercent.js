/**
 * Format an uptime percentage into a human-friendly string.
 *
 * Rules:
 *   - null / undefined -> "No data" (NEVER 0%!)
 *   - 100 -> "100%"
 *   - 99.5 -> "99.5%"
 *   - 99.987 -> "99.99%"
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'No data';
  }

  // If already a whole number, don't force extra decimal zeros unless needed
  const num = Number(value);
  if (Number.isInteger(num)) {
    return `${num}%`;
  }

  return `${num.toFixed(decimals)}%`;
}
