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

/**
 * Format an elapsed time interval between two dates or from a start date until now.
 * e.g. "45m", "2h 15m", "3d 4h", "< 1m"
 */
export function formatElapsedDuration(start, end = null) {
  if (!start) return '—';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();

  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const totalMins = Math.floor(diffMs / (60 * 1000));

  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return `${totalMins}m`;

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

