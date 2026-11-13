/**
 * Pure business rules for evaluating whether an incident alert should be dispatched
 * to a specific notification channel.
 *
 * Rules Hierarchy & Priority:
 * 1. Channel Active: Channel must be enabled (`channel.enabled === true`).
 *    Skip reason: 'disabled'.
 * 2. Event Subscription: The triggering event ('incident_opened' or 'incident_resolved')
 *    must be present in the channel's subscribed events array (`channel.events`).
 *    Skip reason: 'disabled'.
 * 3. Severity Threshold: The incident's severity must meet or exceed the channel's
 *    minimum severity threshold according to the hierarchy:
 *    low (1) < medium (2) < high (3) < critical (4).
 *    Skip reason: 'severity'.
 * 4. Resolved-Without-Opened Guard: For 'incident_resolved' events, a notification
 *    is only sent if the corresponding 'incident_opened' delivery for the SAME
 *    incident AND channel was actually sent (status 'sent'). If the opened alert
 *    was skipped (e.g. by cooldown, severity, rate limit), failed after retries,
 *    or never existed, the resolved notification is skipped.
 *    Skip reason: 'no_open_alert'.
 * 5. Anti-Flapping Cooldown: For 'incident_opened' events, if an incident opened alert
 *    for the SAME application was dispatched within the cooldown window
 *    (`elapsedMs < cooldownMinutes * 60 * 1000`), the alert is suppressed.
 *    Note: 'incident_resolved' events are NOT subject to the cooldown.
 *    Skip reason: 'cooldown'.
 * 6. Per-User Rate Cap: The total number of notifications sent by the account owner
 *    in the rolling 1-hour window must be strictly less than `ratePerHour`.
 *    Applies to both 'incident_opened' and 'incident_resolved'.
 *    Skip reason: 'rate_limit'.
 * 7. Eligible: If all criteria pass, returns `{ notify: true, skipReason: null }`.
 */

export const SEVERITY_LEVELS = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});

/**
 * Evaluates alerting rules against a channel configuration and trigger context.
 *
 * @param {Object} params
 * @param {Object} params.channel - Channel document or plain object
 * @param {string} params.event - Event type ('incident_opened', 'slo_breached', etc.)
 * @param {Object} [params.incident] - Incident object with severity ('low'|'medium'|'high'|'critical')
 * @param {string} [params.severity] - Direct event severity override
 * @param {Date|number|null} [params.lastOpenedNotificationAt] - Timestamp of previous alert for anti-flapping
 * @param {Date|number|null} [params.lastNotificationAt] - Alias for lastOpenedNotificationAt
 * @param {boolean|null} [params.openDeliveryWasSent] - For incident_resolved / slo_recovered: was the initial alert sent?
 * @param {number} params.sentInLastHour - Count of notifications sent by owner in the past 60 mins
 * @param {Date|number} [params.now] - Current timestamp (defaults to Date.now())
 * @param {number} [params.cooldownMinutes=5] - Cooldown duration in minutes
 * @param {number} [params.ratePerHour=30] - Max allowed sent notifications per hour
 * @returns {{ notify: boolean, skipReason: 'disabled'|'severity'|'cooldown'|'rate_limit'|'no_open_alert'|null }}
 */
export function shouldNotify({
  channel,
  event,
  incident,
  severity = null,
  lastOpenedNotificationAt = null,
  lastNotificationAt = null,
  openDeliveryWasSent = null,
  sentInLastHour = 0,
  now = Date.now(),
  cooldownMinutes = 5,
  ratePerHour = 30,
  isMaintenance = false
}) {
  if (isMaintenance && event !== 'test') {
    return { notify: false, skipReason: 'maintenance_mode' };
  }

  if (!channel || !channel.enabled) {
    return { notify: false, skipReason: 'disabled' };
  }

  if (!channel.events || !Array.isArray(channel.events) || !channel.events.includes(event)) {
    return { notify: false, skipReason: 'disabled' };
  }

  // Severity threshold comparison
  const channelMinLevel = SEVERITY_LEVELS[channel.minSeverity || 'low'] || 1;
  const effectiveSeverity = severity || incident?.severity || 'low';
  const incidentLevel = SEVERITY_LEVELS[effectiveSeverity] || 1;

  if (incidentLevel < channelMinLevel) {
    return { notify: false, skipReason: 'severity' };
  }

  // Resolved-without-opened guard: only send incident_resolved or slo_recovered if the opened/breached
  // delivery for this exact incident/episode and channel was successfully sent.
  // When openDeliveryWasSent is null (not provided), skip this check for backwards compatibility.
  if ((event === 'incident_resolved' || event === 'slo_recovered') && openDeliveryWasSent !== null && !openDeliveryWasSent) {
    return { notify: false, skipReason: 'no_open_alert' };
  }

  // Anti-flapping cooldown check
  // Exempt events: incident_resolved, slo_recovered, slo_monitoring_restored, slo_budget_replenished, test
  const isCooldownExempt =
    event === 'incident_resolved' ||
    event === 'slo_recovered' ||
    event === 'slo_monitoring_restored' ||
    event === 'slo_budget_replenished' ||
    event === 'test';

  const lastNotif = lastNotificationAt || lastOpenedNotificationAt;
  if (!isCooldownExempt && lastNotif) {
    const currentTime = now instanceof Date ? now.getTime() : Number(now);
    const lastTime =
      lastNotif instanceof Date
        ? lastNotif.getTime()
        : Number(lastNotif);

    const cooldownMs = (cooldownMinutes || 5) * 60 * 1000;
    const elapsedMs = currentTime - lastTime;

    if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
      return { notify: false, skipReason: 'cooldown' };
    }
  }

  // Hourly rate limit check applies to all outbound notifications
  if (typeof sentInLastHour === 'number' && sentInLastHour >= ratePerHour) {
    return { notify: false, skipReason: 'rate_limit' };
  }

  return { notify: true, skipReason: null };
}

