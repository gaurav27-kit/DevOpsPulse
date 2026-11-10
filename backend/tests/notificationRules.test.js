import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotify, SEVERITY_LEVELS } from '../src/services/notificationRules.js';

describe('Notification Rules (services/notificationRules.js)', () => {
  const baseChannel = {
    _id: 'channel_1',
    enabled: true,
    events: ['incident_opened', 'incident_resolved'],
    minSeverity: 'low'
  };

  const baseIncident = {
    _id: 'incident_1',
    severity: 'medium',
    status: 'open'
  };

  const now = 1700000000000;

  it('1. returns notify: true when channel is enabled and all conditions are met', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  it('2. returns skipReason: "disabled" when channel.enabled is false', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, enabled: false },
      event: 'incident_opened',
      incident: baseIncident,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'disabled' });
  });

  it('3. returns skipReason: "disabled" when event is not in channel.events', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, events: ['incident_opened'] },
      event: 'incident_resolved',
      incident: baseIncident,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'disabled' });
  });

  it('4. returns skipReason: "severity" when incident severity (low) is below channel minSeverity (medium)', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, minSeverity: 'medium' },
      event: 'incident_opened',
      incident: { ...baseIncident, severity: 'low' },
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'severity' });
  });

  it('5. returns skipReason: "severity" when incident severity (medium) is below channel minSeverity (high)', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, minSeverity: 'high' },
      event: 'incident_opened',
      incident: { ...baseIncident, severity: 'medium' },
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'severity' });
  });

  it('6. returns skipReason: "severity" when incident severity (high) is below channel minSeverity (critical)', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, minSeverity: 'critical' },
      event: 'incident_opened',
      incident: { ...baseIncident, severity: 'high' },
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'severity' });
  });

  it('7. returns notify: true when incident severity equals channel minSeverity (critical == critical)', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, minSeverity: 'critical' },
      event: 'incident_opened',
      incident: { ...baseIncident, severity: 'critical' },
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  it('8. returns notify: true when incident severity exceeds channel minSeverity (critical > high)', () => {
    const result = shouldNotify({
      channel: { ...baseChannel, minSeverity: 'high' },
      event: 'incident_opened',
      incident: { ...baseIncident, severity: 'critical' },
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  it('9. returns skipReason: "cooldown" for incident_opened when within cooldown window (e.g. 2 minutes elapsed vs 5 min cooldown)', () => {
    const twoMinutesAgo = now - 2 * 60 * 1000;
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      lastOpenedNotificationAt: twoMinutesAgo,
      cooldownMinutes: 5,
      sentInLastHour: 1,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'cooldown' });
  });

  it('10. respects cooldown boundary (4m59s skips, 5m01s notifies)', () => {
    const insideBoundary = now - (5 * 60 * 1000 - 1000); // 4 min 59 sec ago
    const skipRes = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      lastOpenedNotificationAt: insideBoundary,
      cooldownMinutes: 5,
      sentInLastHour: 1,
      now
    });
    assert.deepEqual(skipRes, { notify: false, skipReason: 'cooldown' });

    const outsideBoundary = now - (5 * 60 * 1000 + 1000); // 5 min 1 sec ago
    const notifyRes = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      lastOpenedNotificationAt: outsideBoundary,
      cooldownMinutes: 5,
      sentInLastHour: 1,
      now
    });
    assert.deepEqual(notifyRes, { notify: true, skipReason: null });
  });

  it('11. incident_resolved ignores cooldown even if previous opened alert was recent', () => {
    const oneMinuteAgo = now - 1 * 60 * 1000;
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_resolved',
      incident: { ...baseIncident, status: 'resolved' },
      lastOpenedNotificationAt: oneMinuteAgo,
      cooldownMinutes: 5,
      sentInLastHour: 1,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  it('12. returns skipReason: "rate_limit" when hourly sent count reaches ratePerHour', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      sentInLastHour: 30,
      ratePerHour: 30,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'rate_limit' });
  });

  it('13. incident_resolved is still subject to the hourly rate cap', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_resolved',
      incident: { ...baseIncident, status: 'resolved' },
      sentInLastHour: 30,
      ratePerHour: 30,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'rate_limit' });
  });

  it('14. notifies when hourly sent count is strictly below ratePerHour (29 < 30)', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      sentInLastHour: 29,
      ratePerHour: 30,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  // --- Resolved-without-opened guard tests ---

  it('15. incident_resolved is skipped with "no_open_alert" when openDeliveryWasSent is false', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_resolved',
      incident: { ...baseIncident, status: 'resolved' },
      openDeliveryWasSent: false,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: false, skipReason: 'no_open_alert' });
  });

  it('16. incident_resolved is sent when openDeliveryWasSent is true', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_resolved',
      incident: { ...baseIncident, status: 'resolved' },
      openDeliveryWasSent: true,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  it('17. incident_resolved falls back to permissive when openDeliveryWasSent is null (backwards compat)', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_resolved',
      incident: { ...baseIncident, status: 'resolved' },
      openDeliveryWasSent: null,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });

  it('18. incident_opened ignores openDeliveryWasSent (only applies to resolved)', () => {
    const result = shouldNotify({
      channel: baseChannel,
      event: 'incident_opened',
      incident: baseIncident,
      openDeliveryWasSent: false,
      sentInLastHour: 0,
      now
    });
    assert.deepEqual(result, { notify: true, skipReason: null });
  });
});

