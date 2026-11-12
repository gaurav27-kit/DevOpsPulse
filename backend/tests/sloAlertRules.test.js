import { describe, it } from 'node:test';
import assert from 'node:assert';
import { decideSloEvents, SLO_EVENT_TYPES, SLO_SEVERITIES } from '../src/services/sloAlertRules.js';

describe('SLO Alert Rules (decideSloEvents)', () => {
  const baseStats = {
    targetPercent: 99.9,
    sli: 99.5,
    budgetConsumedPct: 60.0,
    budgetRemainingPct: 40.0,
    status: 'at_risk',
    totals: { good: 995, bad: 5, total: 1000 },
    burnRates: { burnRate1h: 0.5, burnRate6h: 0.5 },
    coveragePct: 100
  };

  it('emits no event when status remains stable and no thresholds are crossed', () => {
    const prevState = {
      status: 'at_risk',
      pendingStatus: null,
      pendingCount: 0,
      episode: 0,
      burnLevel: 'none',
      dataState: 'ok',
      lastEvaluatedAt: new Date('2026-11-12T12:00:00Z'),
      version: 1
    };

    const ctx = {
      now: new Date('2026-11-12T12:01:00Z'),
      lastCheckAt: new Date('2026-11-12T12:00:50Z'),
      intervalSeconds: 60
    };

    const { events, nextState } = decideSloEvents(prevState, baseStats, ctx);
    assert.strictEqual(events.length, 0);
    assert.strictEqual(nextState.status, 'at_risk');
    assert.strictEqual(nextState.pendingStatus, null);
  });

  it('debounces status transitions: 1 observation emits nothing, 2 observations >= 60s apart emit event', () => {
    // Healthy state initially
    const prevState = {
      status: 'healthy',
      pendingStatus: null,
      pendingCount: 0,
      episode: 0,
      burnLevel: 'none',
      dataState: 'ok',
      lastEvaluatedAt: new Date('2026-11-12T12:00:00Z'),
      version: 0
    };

    // First observation of at_risk
    const t1 = new Date('2026-11-12T12:01:00Z');
    const res1 = decideSloEvents(prevState, baseStats, {
      now: t1,
      lastCheckAt: t1,
      intervalSeconds: 60
    });

    assert.strictEqual(res1.events.length, 0, 'First observation must not emit an alert');
    assert.strictEqual(res1.nextState.status, 'healthy', 'Confirmed status remains healthy');
    assert.strictEqual(res1.nextState.pendingStatus, 'at_risk', 'Pending status becomes at_risk');
    assert.strictEqual(res1.nextState.pendingCount, 1);

    // Second evaluation too fast (< 60s)
    const tTooFast = new Date('2026-11-12T12:01:30Z');
    const resTooFast = decideSloEvents(res1.nextState, baseStats, {
      now: tTooFast,
      lastCheckAt: tTooFast,
      intervalSeconds: 60
    });
    assert.strictEqual(resTooFast.events.length, 0, 'Evaluation under 60s debounce must not emit');
    assert.strictEqual(resTooFast.nextState.pendingCount, 2);

    // Second evaluation >= 60s after first observation
    const t2 = new Date('2026-11-12T12:02:05Z');
    const res2 = decideSloEvents(res1.nextState, baseStats, {
      now: t2,
      lastCheckAt: t2,
      intervalSeconds: 60
    });

    assert.strictEqual(res2.events.length, 1, 'Second evaluation >= 60s must emit event');
    assert.strictEqual(res2.events[0].type, SLO_EVENT_TYPES.SLO_AT_RISK);
    assert.strictEqual(res2.events[0].severity, SLO_SEVERITIES.MEDIUM);
    assert.strictEqual(res2.nextState.status, 'at_risk');
    assert.strictEqual(res2.nextState.pendingStatus, null);
  });

  it('confirms breached status, increments episode, and includes budget details', () => {
    const prevState = {
      status: 'at_risk',
      pendingStatus: 'breached',
      pendingCount: 1,
      pendingSince: new Date('2026-11-12T12:00:00Z').getTime(),
      episode: 2,
      burnLevel: 'none',
      dataState: 'ok',
      version: 3
    };

    const breachedStats = {
      targetPercent: 99.9,
      sli: 99.8,
      budgetConsumedPct: 150.0,
      budgetRemainingPct: 0.0,
      status: 'breached',
      totals: { good: 998, bad: 2, total: 1000 },
      burnRates: { burnRate1h: 0.0, burnRate6h: 0.0 }
    };

    const t = new Date('2026-11-12T12:01:05Z');
    const { events, nextState } = decideSloEvents(prevState, breachedStats, {
      now: t,
      lastCheckAt: t,
      intervalSeconds: 60
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, SLO_EVENT_TYPES.SLO_BREACHED);
    assert.strictEqual(events[0].severity, SLO_SEVERITIES.CRITICAL);
    assert.strictEqual(events[0].details.episode, 3, 'Episode must increment on breach');
    assert.strictEqual(events[0].details.budgetAllowed, 0.1);
    assert.strictEqual(events[0].details.budgetConsumedPct, 150.0);
    assert.strictEqual(events[0].details.budgetRemainingPct, 0.0);
    assert.strictEqual(nextState.status, 'breached');
    assert.strictEqual(nextState.episode, 3);
  });

  it('re-fires slo_breached and increments episode again on subsequent breach after recovery', () => {
    // Previously in episode 1, currently healthy
    const prevState = {
      status: 'healthy',
      pendingStatus: 'breached',
      pendingCount: 1,
      pendingSince: new Date('2026-11-12T12:00:00Z').getTime(),
      episode: 1,
      burnLevel: 'none',
      dataState: 'ok'
    };

    const breachedStats = {
      targetPercent: 99.9,
      sli: 99.7,
      budgetConsumedPct: 200.0,
      budgetRemainingPct: 0.0,
      status: 'breached',
      totals: { good: 997, bad: 3, total: 1000 }
    };

    const t = new Date('2026-11-12T12:01:10Z');
    const { events, nextState } = decideSloEvents(prevState, breachedStats, {
      now: t,
      lastCheckAt: t,
      intervalSeconds: 60
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, SLO_EVENT_TYPES.SLO_BREACHED);
    assert.strictEqual(events[0].details.episode, 2);
    assert.strictEqual(nextState.episode, 2);
  });

  it('emits slo_recovered when recovering from breached to at_risk or healthy', () => {
    const prevState = {
      status: 'breached',
      pendingStatus: 'healthy',
      pendingCount: 1,
      pendingSince: new Date('2026-11-12T12:00:00Z').getTime(),
      episode: 1,
      burnLevel: 'none',
      dataState: 'ok'
    };

    const healthyStats = {
      targetPercent: 99.9,
      sli: 99.95,
      budgetConsumedPct: 20.0,
      budgetRemainingPct: 80.0,
      status: 'healthy',
      totals: { good: 9995, bad: 5, total: 10000 }
    };

    const t = new Date('2026-11-12T12:01:10Z');
    const { events, nextState } = decideSloEvents(prevState, healthyStats, {
      now: t,
      lastCheckAt: t,
      intervalSeconds: 60
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, SLO_EVENT_TYPES.SLO_RECOVERED);
    assert.strictEqual(events[0].severity, SLO_SEVERITIES.LOW);
    assert.strictEqual(events[0].details.episode, 1);
    assert.strictEqual(nextState.status, 'healthy');
  });

  it('emits slo_budget_replenished when recovering from at_risk to healthy', () => {
    const prevState = {
      status: 'at_risk',
      pendingStatus: 'healthy',
      pendingCount: 1,
      pendingSince: new Date('2026-11-12T12:00:00Z').getTime(),
      episode: 0,
      burnLevel: 'none',
      dataState: 'ok'
    };

    const healthyStats = {
      targetPercent: 99.9,
      sli: 99.95,
      budgetConsumedPct: 15.0,
      budgetRemainingPct: 85.0,
      previousRemainingBudget: 35.0,
      status: 'healthy',
      totals: { good: 9995, bad: 5, total: 10000 }
    };

    const t = new Date('2026-11-12T12:01:10Z');
    const { events, nextState } = decideSloEvents(prevState, healthyStats, {
      now: t,
      lastCheckAt: t,
      intervalSeconds: 60
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, SLO_EVENT_TYPES.SLO_BUDGET_REPLENISHED);
    assert.strictEqual(events[0].severity, SLO_SEVERITIES.LOW);
    assert.strictEqual(events[0].details.previousRemainingBudget, 35.0);
    assert.strictEqual(events[0].details.currentRemainingBudget, 85.0);
    assert.strictEqual(nextState.status, 'healthy');
  });

  it('burn rate thresholds: exactly on and just below critical (14.4 & 6.0)', () => {
    const prevState = {
      status: 'healthy',
      burnLevel: 'none',
      dataState: 'ok'
    };

    // Just below 14.4 (14.39)
    const justBelowStats = {
      status: 'healthy',
      burnRates: { burnRate1h: 14.39, burnRate6h: 6.0 }
    };
    const resBelow = decideSloEvents(prevState, justBelowStats, { now: new Date() });
    assert.strictEqual(resBelow.events.length, 1);
    assert.strictEqual(resBelow.events[0].type, SLO_EVENT_TYPES.SLO_HIGH_BURN_RATE);
    assert.strictEqual(resBelow.events[0].severity, SLO_SEVERITIES.HIGH, 'Must classify as HIGH, not CRITICAL');
    assert.strictEqual(resBelow.nextState.burnLevel, 'high');

    // Exactly on 14.4 and 6.0
    const exactlyStats = {
      status: 'healthy',
      burnRates: { burnRate1h: 14.4, burnRate6h: 6.0 }
    };
    const resExact = decideSloEvents(prevState, exactlyStats, { now: new Date() });
    assert.strictEqual(resExact.events.length, 1);
    assert.strictEqual(resExact.events[0].type, SLO_EVENT_TYPES.SLO_HIGH_BURN_RATE);
    assert.strictEqual(resExact.events[0].severity, SLO_SEVERITIES.CRITICAL);
    assert.strictEqual(resExact.nextState.burnLevel, 'critical');
  });

  it('burn rate escalation (high -> critical) fires new critical event', () => {
    const prevState = {
      status: 'healthy',
      burnLevel: 'high',
      dataState: 'ok'
    };

    const escalatedStats = {
      status: 'healthy',
      burnRates: { burnRate1h: 15.0, burnRate6h: 6.5 }
    };

    const res = decideSloEvents(prevState, escalatedStats, { now: new Date() });
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].type, SLO_EVENT_TYPES.SLO_HIGH_BURN_RATE);
    assert.strictEqual(res.events[0].severity, SLO_SEVERITIES.CRITICAL);
    assert.strictEqual(res.nextState.burnLevel, 'critical');
  });

  it('burn rate hysteresis: holds until burnRate6h < 3.0, then clears silently', () => {
    const prevState = {
      status: 'healthy',
      burnLevel: 'critical',
      dataState: 'ok'
    };

    // Burn rates drop below 6.0 but remain >= 3.0 (e.g. 4.0)
    const holdingStats = {
      status: 'healthy',
      burnRates: { burnRate1h: 1.0, burnRate6h: 4.0 }
    };

    const resHold = decideSloEvents(prevState, holdingStats, { now: new Date() });
    assert.strictEqual(resHold.events.length, 0, 'No event emitted while hysteresis holds');
    assert.strictEqual(resHold.nextState.burnLevel, 'critical', 'Burn level held by hysteresis');

    // Burn rate 6h drops below 3.0 (2.9)
    const clearingStats = {
      status: 'healthy',
      burnRates: { burnRate1h: 1.0, burnRate6h: 2.9 }
    };

    const resClear = decideSloEvents(prevState, clearingStats, { now: new Date() });
    assert.strictEqual(resClear.events.length, 0, 'Clearing must be silent');
    assert.strictEqual(resClear.nextState.burnLevel, 'none', 'Burn level cleared');
  });

  it('monitoring unavailable and restored rules with max(3 * interval, 300) threshold', () => {
    const intervalSeconds = 60;
    const thresholdSeconds = Math.max(3 * 60, 300); // 300 seconds
    const lastCheck = new Date('2026-11-12T12:00:00Z');

    // 299 seconds later: still available
    const tNotYet = new Date(lastCheck.getTime() + 299 * 1000);
    const resNotYet = decideSloEvents(
      { status: 'healthy', dataState: 'ok' },
      baseStats,
      { now: tNotYet, lastCheckAt: lastCheck, intervalSeconds }
    );
    assert.strictEqual(resNotYet.events.some((e) => e.type === SLO_EVENT_TYPES.SLO_MONITORING_UNAVAILABLE), false);

    // 301 seconds later: unavailable!
    const tUnavailable = new Date(lastCheck.getTime() + 301 * 1000);
    const resUnavail = decideSloEvents(
      { status: 'healthy', dataState: 'ok' },
      baseStats,
      { now: tUnavailable, lastCheckAt: lastCheck, intervalSeconds }
    );
    const unavailEvent = resUnavail.events.find((e) => e.type === SLO_EVENT_TYPES.SLO_MONITORING_UNAVAILABLE);
    assert.ok(unavailEvent);
    assert.strictEqual(unavailEvent.severity, SLO_SEVERITIES.HIGH);
    assert.strictEqual(resUnavail.nextState.dataState, 'stale');

    // Checks resume (restored)
    const resumedCheck = new Date(tUnavailable.getTime() + 10 * 1000);
    const resRestored = decideSloEvents(
      resUnavail.nextState,
      baseStats,
      { now: resumedCheck, lastCheckAt: resumedCheck, intervalSeconds }
    );
    const restoredEvent = resRestored.events.find((e) => e.type === SLO_EVENT_TYPES.SLO_MONITORING_RESTORED);
    assert.ok(restoredEvent);
    assert.strictEqual(restoredEvent.severity, SLO_SEVERITIES.LOW);
    assert.strictEqual(resRestored.nextState.dataState, 'ok');
  });

  it('insufficient data fires only when SLO is older than 2 x 20 x interval and total < 20', () => {
    const intervalSeconds = 60;
    const requiredAgeSeconds = 2 * 20 * 60; // 2400 seconds
    const sloCreatedAt = new Date('2026-11-12T10:00:00Z');

    const lowCheckStats = {
      status: 'insufficient_data',
      totals: { good: 10, bad: 0, total: 10 },
      coveragePct: 50.0
    };

    // Young SLO: 1000 seconds old
    const tYoung = new Date(sloCreatedAt.getTime() + 1000 * 1000);
    const resYoung = decideSloEvents(
      { status: 'insufficient_data', dataState: 'ok' },
      lowCheckStats,
      { now: tYoung, sloCreatedAt, intervalSeconds }
    );
    assert.strictEqual(resYoung.events.some((e) => e.type === SLO_EVENT_TYPES.SLO_INSUFFICIENT_DATA), false);

    // Old SLO: 2500 seconds old (> 2400s)
    const tOld = new Date(sloCreatedAt.getTime() + 2500 * 1000);
    const resOld = decideSloEvents(
      { status: 'insufficient_data', dataState: 'ok' },
      lowCheckStats,
      { now: tOld, sloCreatedAt, intervalSeconds }
    );
    const insuffEvent = resOld.events.find((e) => e.type === SLO_EVENT_TYPES.SLO_INSUFFICIENT_DATA);
    assert.ok(insuffEvent);
    assert.strictEqual(insuffEvent.severity, SLO_SEVERITIES.LOW);
    assert.strictEqual(insuffEvent.details.totalChecks, 10);
    assert.strictEqual(insuffEvent.details.minimum, 20);
    assert.strictEqual(resOld.nextState.dataState, 'insufficient');

    // When checks reach 20, state returns to 'ok' silently (no separate recovery alert)
    const enoughCheckStats = {
      status: 'healthy',
      totals: { good: 20, bad: 0, total: 20 },
      coveragePct: 100.0
    };
    const resResolved = decideSloEvents(
      resOld.nextState,
      enoughCheckStats,
      { now: new Date(tOld.getTime() + 60 * 1000), sloCreatedAt, intervalSeconds }
    );
    assert.strictEqual(resResolved.nextState.dataState, 'ok');
  });
});

