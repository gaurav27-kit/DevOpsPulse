/**
 * Status state machine: pure function computing next application status from a check result.
 * No database access. Designed to be unit-testable in isolation.
 *
 * Rules (matches ARCHITECTURE.md section 3):
 *
 * FAILURE path:
 *   - Always: consecutiveFailures += 1, consecutiveSuccesses = 0
 *   - If consecutiveFailures >= 2 => status becomes "down"
 *   - With only 1 failure the status does NOT change (unknown stays unknown)
 *
 * SUCCESS path:
 *   - Always: consecutiveSuccesses += 1, consecutiveFailures = 0
 *   - If current status is "down": requires 2 consecutive successes to recover
 *       * 1st success => stays "down"
 *       * 2nd success => becomes "up" (or "degraded" if slow)
 *   - Otherwise (unknown/up/degraded): status immediately becomes "up" or "degraded" (if slow)
 *
 * @param {object} app - Application document with { status, consecutiveFailures, consecutiveSuccesses }
 * @param {object} result - Check result with { success, responseTimeMs }
 * @param {number} slowThresholdMs - Response time above which success is marked "degraded"
 * @returns {{ status: string, consecutiveFailures: number, consecutiveSuccesses: number }}
 */
export function computeNextState(app, result, slowThresholdMs) {
  const { success, responseTimeMs } = result;

  let { status, consecutiveFailures, consecutiveSuccesses } = app;

  if (!success) {
    consecutiveFailures = (consecutiveFailures || 0) + 1;
    consecutiveSuccesses = 0;

    if (consecutiveFailures >= 2) {
      status = 'down';
    }
    // With only 1 failure, status does not change

  } else {
    consecutiveSuccesses = (consecutiveSuccesses || 0) + 1;
    consecutiveFailures = 0;

    const isSlow = responseTimeMs > slowThresholdMs;
    const nextHealthyStatus = isSlow ? 'degraded' : 'up';

    if (status === 'down') {
      // Recovering from down: needs 2 consecutive successes
      if (consecutiveSuccesses >= 2) {
        status = nextHealthyStatus;
      }
      // else: still "down" after first recovery success
    } else {
      // unknown, up, or degraded: immediately update to up/degraded
      status = nextHealthyStatus;
    }
  }

  return { status, consecutiveFailures, consecutiveSuccesses };
}
