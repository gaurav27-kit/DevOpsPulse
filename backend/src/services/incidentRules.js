/**
 * Pure decision function: NO database access, NO side effects.
 * Determines what incident action should be taken based on the current check outcome
 * and counters (which have ALREADY been updated for this check by computeNextState).
 *
 * Rules:
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ "open"   : Failure + no active incident + consecutiveFailures >= 2        │
 * │            → Create a new incident. The threshold of 2 prevents a single  │
 * │              flap from opening an incident.                                │
 * │                                                                            │
 * │ "update" : Failure + active incident already exists                        │
 * │            → Increment failureCount and set lastFailureAt. Keeps the       │
 * │              existing incident hot without creating duplicates.             │
 * │                                                                            │
 * │ "resolve": Success + active incident + consecutiveSuccesses >= 2           │
 * │            → Close the incident. The threshold of 2 prevents a single      │
 * │              flap from auto-resolving a real outage.                        │
 * │                                                                            │
 * │ "none"   : Everything else:                                                 │
 * │            - 1st failure (no incident yet, below threshold)                 │
 * │            - 1st success while recovering (below resolve threshold)         │
 * │            - Success when no incident exists                                │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * @param {object} params
 * @param {boolean} params.resultSuccess         - Was this check successful?
 * @param {number}  params.consecutiveFailures   - Updated counter AFTER this check
 * @param {number}  params.consecutiveSuccesses  - Updated counter AFTER this check
 * @param {boolean} params.hasActiveIncident     - Is there a currently open/investigating incident?
 * @returns {"open"|"update"|"resolve"|"none"}
 */
export function decideIncidentAction({
  resultSuccess,
  consecutiveFailures,
  consecutiveSuccesses,
  hasActiveIncident
}) {
  if (!resultSuccess) {
    if (!hasActiveIncident && consecutiveFailures >= 2) return 'open';
    if (hasActiveIncident) return 'update';
    return 'none'; // single failure, no active incident yet
  }

  // resultSuccess === true
  if (hasActiveIncident && consecutiveSuccesses >= 2) return 'resolve';
  return 'none';
}

