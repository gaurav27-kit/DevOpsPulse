/**
 * backend/src/services/sloAlertRules.js
 *
 * Pure business logic for SLO alert transitions and event emissions.
 * Zero database calls, zero wall-clock reads (all timestamps passed via ctx.now).
 */

export const SLO_EVENT_TYPES = Object.freeze({
  SLO_AT_RISK: 'slo_at_risk',
  SLO_BREACHED: 'slo_breached',
  SLO_HIGH_BURN_RATE: 'slo_high_burn_rate',
  SLO_RECOVERED: 'slo_recovered',
  SLO_BUDGET_REPLENISHED: 'slo_budget_replenished',
  SLO_INSUFFICIENT_DATA: 'slo_insufficient_data',
  SLO_MONITORING_UNAVAILABLE: 'slo_monitoring_unavailable',
  SLO_MONITORING_RESTORED: 'slo_monitoring_restored'
});

export const SLO_SEVERITIES = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Pure evaluation function deciding SLO alerting events and next state machine state.
 *
 * @param {Object} prevState - Current SloAlertState document or plain object
 * @param {Object} stats - Computed SLO stats (from computeSloStats / getSloForApplication)
 * @param {Object} ctx
 * @param {Date|number} ctx.now - Current timestamp
 * @param {Date|number|null} [ctx.lastCheckAt] - Timestamp of latest recorded check for application
 * @param {number} [ctx.intervalSeconds=60] - Application check interval in seconds
 * @param {Date|number|null} [ctx.sloCreatedAt] - When the SLO definition was created
 * @param {Object} [ctx.config] - Optional configuration overrides (burn thresholds, cooldowns)
 * @returns {{ events: Array<{ type: string, severity: string, details: Object }>, nextState: Object }}
 */
export function decideSloEvents(prevState, stats, ctx = {}) {
  const nowTime =
    ctx.now instanceof Date
      ? ctx.now.getTime()
      : typeof ctx.now === 'number'
      ? ctx.now
      : Date.now();
  const nowDate = new Date(nowTime);

  const intervalSeconds = Number(ctx.intervalSeconds) || 60;
  const config = ctx.config || {};
  const fast1h = Number(config.SLO_BURN_FAST_1H) || 14.4;
  const slow6h = Number(config.SLO_BURN_SLOW_6H) || 6.0;
  const clear6h = Number(config.SLO_BURN_CLEAR_6H) || 3.0;

  const nextState = {
    sloId: prevState?.sloId,
    applicationId: prevState?.applicationId,
    ownerId: prevState?.ownerId,
    status: prevState?.status || 'insufficient_data',
    pendingStatus: prevState?.pendingStatus ?? null,
    pendingCount: Number(prevState?.pendingCount) || 0,
    pendingSince: prevState?.pendingSince ?? null,
    episode: Number(prevState?.episode) || 0,
    burnLevel: prevState?.burnLevel || 'none',
    dataState: prevState?.dataState || 'ok',
    lastEvaluatedAt: nowDate,
    version: Number(prevState?.version) || 0
  };

  const events = [];

  // ==========================================
  // 1. Data Availability & Monitoring Checks
  // ==========================================
  const lastCheckAt = ctx.lastCheckAt ? new Date(ctx.lastCheckAt) : null;
  const unavailableThresholdSeconds = Math.max(3 * intervalSeconds, 300);

  if (lastCheckAt) {
    const elapsedSeconds = (nowTime - lastCheckAt.getTime()) / 1000;
    if (elapsedSeconds > unavailableThresholdSeconds) {
      if (nextState.dataState !== 'stale') {
        events.push({
          type: SLO_EVENT_TYPES.SLO_MONITORING_UNAVAILABLE,
          severity: SLO_SEVERITIES.HIGH,
          details: {
            lastCheckAt: lastCheckAt.toISOString(),
            elapsedSeconds: Math.round(elapsedSeconds),
            thresholdSeconds: unavailableThresholdSeconds
          }
        });
        nextState.dataState = 'stale';
      }
    } else {
      // Checks have resumed
      if (nextState.dataState === 'stale') {
        events.push({
          type: SLO_EVENT_TYPES.SLO_MONITORING_RESTORED,
          severity: SLO_SEVERITIES.LOW,
          details: {
            lastCheckAt: lastCheckAt.toISOString(),
            resumedAt: nowDate.toISOString()
          }
        });
        nextState.dataState = 'ok';
      }
    }
  }

  // Insufficient data: SLO older than 2 x 20 x intervalSeconds and total checks < 20
  const sloCreatedAt = ctx.sloCreatedAt ? new Date(ctx.sloCreatedAt) : null;
  const totalChecks = stats?.totals?.total ?? 0;
  if (sloCreatedAt && nextState.dataState !== 'stale') {
    const sloAgeSeconds = (nowTime - sloCreatedAt.getTime()) / 1000;
    const insufficientAgeThreshold = 2 * 20 * intervalSeconds;

    if (sloAgeSeconds > insufficientAgeThreshold && totalChecks < 20) {
      if (nextState.dataState !== 'insufficient') {
        events.push({
          type: SLO_EVENT_TYPES.SLO_INSUFFICIENT_DATA,
          severity: SLO_SEVERITIES.LOW,
          details: {
            totalChecks,
            minimum: 20,
            coveragePct: stats?.coveragePct ?? 0,
            sloAgeSeconds: Math.round(sloAgeSeconds)
          }
        });
        nextState.dataState = 'insufficient';
      }
    } else if (totalChecks >= 20 && nextState.dataState === 'insufficient') {
      nextState.dataState = 'ok';
    }
  }

  // ==========================================
  // 2. Status Transitions with 60s Debounce
  // ==========================================
  const observedStatus = stats?.status || 'insufficient_data';

  if (observedStatus === nextState.status) {
    // Current confirmed status matches observation: clear any pending candidate
    nextState.pendingStatus = null;
    nextState.pendingCount = 0;
    nextState.pendingSince = null;
  } else {
    // Observed status differs from confirmed status
    if (nextState.pendingStatus !== observedStatus) {
      // First evaluation seeing this new status candidate
      nextState.pendingStatus = observedStatus;
      nextState.pendingCount = 1;
      nextState.pendingSince = nowTime;
    } else {
      // Second or subsequent evaluation seeing the same candidate
      const pendingSinceTime =
        nextState.pendingSince instanceof Date
          ? nextState.pendingSince.getTime()
          : typeof nextState.pendingSince === 'number'
          ? nextState.pendingSince
          : prevState?.lastEvaluatedAt
          ? new Date(prevState.lastEvaluatedAt).getTime()
          : nowTime;

      const debounceElapsedSeconds = (nowTime - pendingSinceTime) / 1000;

      if (debounceElapsedSeconds >= 60) {
        // Confirmed transition after 2 evaluations >= 60s apart!
        const prevConfirmedStatus = nextState.status;
        const newConfirmedStatus = observedStatus;

        nextState.status = newConfirmedStatus;
        nextState.pendingStatus = null;
        nextState.pendingCount = 0;
        nextState.pendingSince = null;

        // Emit corresponding event for confirmed transition
        if (newConfirmedStatus === 'at_risk') {
          if (prevConfirmedStatus === 'healthy' || prevConfirmedStatus === 'insufficient_data') {
            events.push({
              type: SLO_EVENT_TYPES.SLO_AT_RISK,
              severity: SLO_SEVERITIES.MEDIUM,
              details: {
                previousStatus: prevConfirmedStatus,
                targetPercent: stats.targetPercent,
                sli: stats.sli,
                budgetConsumedPct: stats.budgetConsumedPct,
                budgetRemainingPct: stats.budgetRemainingPct
              }
            });
          } else if (prevConfirmedStatus === 'breached') {
            events.push({
              type: SLO_EVENT_TYPES.SLO_RECOVERED,
              severity: SLO_SEVERITIES.LOW,
              details: {
                episode: nextState.episode,
                previousStatus: 'breached',
                newStatus: 'at_risk',
                targetPercent: stats.targetPercent,
                sli: stats.sli,
                budgetConsumedPct: stats.budgetConsumedPct,
                budgetRemainingPct: stats.budgetRemainingPct
              }
            });
          }
        } else if (newConfirmedStatus === 'breached') {
          // any -> breached (+1 episode)
          nextState.episode += 1;
          const allowedRate = stats?.targetPercent ? Number((100 - stats.targetPercent).toFixed(3)) : 0.1;
          events.push({
            type: SLO_EVENT_TYPES.SLO_BREACHED,
            severity: SLO_SEVERITIES.CRITICAL,
            details: {
              episode: nextState.episode,
              previousStatus: prevConfirmedStatus,
              targetPercent: stats.targetPercent,
              sli: stats.sli,
              budgetAllowed: allowedRate,
              budgetConsumedPct: stats.budgetConsumedPct,
              budgetRemainingPct: stats.budgetRemainingPct ?? 0
            }
          });
        } else if (newConfirmedStatus === 'healthy') {
          if (prevConfirmedStatus === 'breached') {
            events.push({
              type: SLO_EVENT_TYPES.SLO_RECOVERED,
              severity: SLO_SEVERITIES.LOW,
              details: {
                episode: nextState.episode,
                previousStatus: 'breached',
                newStatus: 'healthy',
                targetPercent: stats.targetPercent,
                sli: stats.sli,
                budgetConsumedPct: stats.budgetConsumedPct,
                budgetRemainingPct: stats.budgetRemainingPct
              }
            });
          } else if (prevConfirmedStatus === 'at_risk') {
            events.push({
              type: SLO_EVENT_TYPES.SLO_BUDGET_REPLENISHED,
              severity: SLO_SEVERITIES.LOW,
              details: {
                previousRemainingBudget: stats.previousRemainingBudget ?? 0,
                currentRemainingBudget: stats.budgetRemainingPct ?? 100
              }
            });
          }
        }
      } else {
        nextState.pendingCount += 1;
      }
    }
  }

  // ==========================================
  // 3. Multi-Window Burn Rate Evaluation
  // ==========================================
  const b1h = Number(stats?.burnRates?.burnRate1h ?? stats?.burnRate1h ?? 0);
  const b6h = Number(stats?.burnRates?.burnRate6h ?? stats?.burnRate6h ?? 0);

  let candidateBurn = 'none';
  if (b1h >= fast1h && b6h >= slow6h) {
    candidateBurn = 'critical';
  } else if (b6h >= slow6h && b1h >= 6.0) {
    candidateBurn = 'high';
  }

  const currentBurn = nextState.burnLevel;

  if (candidateBurn === 'critical') {
    if (currentBurn !== 'critical') {
      // Entering or escalating to critical!
      events.push({
        type: SLO_EVENT_TYPES.SLO_HIGH_BURN_RATE,
        severity: SLO_SEVERITIES.CRITICAL,
        details: {
          burnRate1h: b1h,
          burnRate6h: b6h,
          threshold1h: fast1h,
          threshold6h: slow6h,
          level: 'critical'
        }
      });
      nextState.burnLevel = 'critical';
    }
  } else if (candidateBurn === 'high') {
    if (currentBurn === 'none') {
      // Entering high from none!
      events.push({
        type: SLO_EVENT_TYPES.SLO_HIGH_BURN_RATE,
        severity: SLO_SEVERITIES.HIGH,
        details: {
          burnRate1h: b1h,
          burnRate6h: b6h,
          threshold1h: 6.0,
          threshold6h: slow6h,
          level: 'high'
        }
      });
      nextState.burnLevel = 'high';
    } else if (currentBurn === 'critical') {
      // De-escalating from critical to high without firing
      nextState.burnLevel = 'high';
    }
  } else {
    // Candidate burn is below high
    if (b6h < clear6h) {
      // Hysteresis clear threshold reached: clear silently
      nextState.burnLevel = 'none';
    }
    // Else b6h >= clear6h: maintain existing elevated burnLevel (hysteresis)
  }

  return { events, nextState };
}

