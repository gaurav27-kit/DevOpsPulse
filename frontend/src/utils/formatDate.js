/**
 * Date and time formatting utilities using native Intl APIs (no external libraries).
 */

/**
 * Format a timestamp into a localized date-time string.
 * Returns 'Never' if the date is null or invalid.
 */
export function formatDateTime(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

/**
 * Format a timestamp into human-readable relative time (e.g. "3 minutes ago", "just now").
 * Returns 'Never' if the date is null.
 */
export function formatRelative(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';

  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (Math.abs(diffSec) < 30) {
    return 'just now';
  }

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, 'minute');
  }
  if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, 'hour');
  }
  if (Math.abs(diffDay) < 30) {
    return rtf.format(diffDay, 'day');
  }

  return formatDateTime(dateString);
}

