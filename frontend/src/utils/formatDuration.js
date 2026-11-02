/**
 * Format a duration in milliseconds into a concise, readable string.
 * e.g.
 *   null / undefined -> 'No data'
 *   123 -> '123 ms'
 *   1234 -> '1.2 s'
 *   65000 -> '65 s'
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) {
    return 'No data';
  }

  const num = Math.round(ms);
  if (num < 1000) {
    return `${num} ms`;
  }

  const seconds = (num / 1000).toFixed(1);
  return `${seconds} s`;
}
