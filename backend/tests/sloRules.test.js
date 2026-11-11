import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSloStats,
  classifySlo,
  computeBurnRate,
  computeCoverage,
  buildBurnDownSeries,
  BURN_RATE_THRESHOLDS
} from '../src/services/sloRules.js';

describe('SLO Rules Engine (services/sloRules.js)', () => {
  it('1. 1000 checks, 5 bad, target 99.9 -> SLI 99.5, consumed 500, remaining 0, breached', () => {
    const stats = computeSloStats({ good: 995, total: 1000, targetPercent: 99.9 });
    assert.equal(stats.sli, 99.5);
    assert.equal(stats.errorRatePct, 0.5);
    assert.equal(stats.budgetConsumedPct, 500);
    assert.equal(stats.budgetRemainingPct, 0);

    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'breached');
  });

  it('2. 2000 checks, 0 bad, target 99.9 -> consumed 0, remaining 100, healthy', () => {
    const stats = computeSloStats({ good: 2000, total: 2000, targetPercent: 99.9 });
    assert.equal(stats.sli, 100);
    assert.equal(stats.errorRatePct, 0);
    assert.equal(stats.budgetConsumedPct, 0);
    assert.equal(stats.budgetRemainingPct, 100);

    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'healthy');
  });

  it('3. 2000 checks, 1 bad, target 99.9 -> consumed 50 -> at_risk (exact 50 boundary)', () => {
    const stats = computeSloStats({ good: 1999, total: 2000, targetPercent: 99.9 });
    assert.equal(stats.budgetConsumedPct, 50);
    assert.equal(stats.budgetRemainingPct, 50);

    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'at_risk');
  });

  it('4. 1000 checks, 1 bad, target 99.9 -> consumed exactly 100 -> at_risk not breached (exact 100 boundary)', () => {
    const stats = computeSloStats({ good: 999, total: 1000, targetPercent: 99.9 });
    assert.equal(stats.budgetConsumedPct, 100);
    assert.equal(stats.budgetRemainingPct, 0);

    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'at_risk');
  });

  it('5. 1000 checks, 2 bad, target 99.9 -> consumed 200 -> breached', () => {
    const stats = computeSloStats({ good: 998, total: 1000, targetPercent: 99.9 });
    assert.equal(stats.budgetConsumedPct, 200);
    assert.equal(stats.budgetRemainingPct, 0);

    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'breached');
  });

  it('6. total 19 checks (< 20) -> insufficient_data even with 100% good', () => {
    const stats = computeSloStats({ good: 19, total: 19, targetPercent: 99.9 });
    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'insufficient_data');
  });

  it('7. total 19 checks (< 20) with failures -> insufficient_data', () => {
    const stats = computeSloStats({ good: 15, total: 19, targetPercent: 99.9 });
    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'insufficient_data');
  });

  it('8. total 0 checks -> insufficient_data with null numbers and zero NaN or Infinity', () => {
    const stats = computeSloStats({ good: 0, total: 0, targetPercent: 99.9 });
    assert.equal(stats.sli, null);
    assert.equal(stats.errorRatePct, null);
    assert.equal(stats.budgetConsumedPct, null);
    assert.equal(stats.budgetRemainingPct, null);
    assert.deepEqual(stats.totals, { good: 0, bad: 0, total: 0 });

    assert.equal(Number.isNaN(stats.sli), false);
    assert.equal(Number.isNaN(stats.budgetConsumedPct), false);

    const status = classifySlo(stats.budgetConsumedPct, stats.totals.total);
    assert.equal(status, 'insufficient_data');
  });

  it('9. target 90.0 edge value (minimum allowed target)', () => {
    // 1000 checks, 100 bad (10% error rate). Allowed error rate = 10%.
    const stats = computeSloStats({ good: 900, total: 1000, targetPercent: 90.0 });
    assert.equal(stats.sli, 90);
    assert.equal(stats.budgetConsumedPct, 100);
    assert.equal(classifySlo(stats.budgetConsumedPct, stats.totals.total), 'at_risk');
  });

  it('10. target 99.999 edge value (maximum allowed target)', () => {
    // Allowed error = 0.001% (1 bad in 100,000)
    // 100,000 checks, 1 bad -> 100% budget consumed
    const stats = computeSloStats({ good: 99999, total: 100000, targetPercent: 99.999 });
    assert.equal(stats.budgetConsumedPct, 100);
    assert.equal(classifySlo(stats.budgetConsumedPct, stats.totals.total), 'at_risk');
  });

  it('11. burn rate 1h exactly 14.4 flags fastBurn', () => {
    // Target 99.9% -> allowedErrorRate = 0.001
    // Need errorRate = 0.0144 -> 144 bad in 10,000 checks
    const burnRate = computeBurnRate(144, 10000, 99.9);
    assert.equal(burnRate, 14.4);
    assert.equal(burnRate >= BURN_RATE_THRESHOLDS.FAST_BURN, true);
  });

  it('12. burn rate 1h just below 14.4 (14.39) does NOT flag fastBurn', () => {
    const burnRate = computeBurnRate(1439, 100000, 99.9);
    assert.equal(burnRate, 14.39);
    assert.equal(burnRate >= BURN_RATE_THRESHOLDS.FAST_BURN, false);
  });

  it('13. burn rate 6h exactly 6.0 flags slowBurn', () => {
    // Target 99.9% -> allowedErrorRate = 0.001
    // Need errorRate = 0.006 -> 60 bad in 10,000 checks
    const burnRate = computeBurnRate(60, 10000, 99.9);
    assert.equal(burnRate, 6.0);
    assert.equal(burnRate >= BURN_RATE_THRESHOLDS.SLOW_BURN, true);
  });

  it('14. no checks in lookback -> burn rate returns null (not 0)', () => {
    const burnRate = computeBurnRate(0, 0, 99.9);
    assert.equal(burnRate, null);
  });

  it('15. coverage calculation and partialWindow boundary (< 50%)', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    // First check 10 days ago for a 30-day window -> 33.33% coverage (< 50% -> partialWindow: true)
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const coverage = computeCoverage(tenDaysAgo, now, 30);
    assert.equal(coverage.coveragePct, 33.33);
    assert.equal(coverage.partialWindow, true);
  });

  it('16. coverage calculation at or above 50% -> partialWindow: false', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    // 15 days out of 30 days = 50%
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const coverage = computeCoverage(fifteenDaysAgo, now, 30);
    assert.equal(coverage.coveragePct, 50.0);
    assert.equal(coverage.partialWindow, false);
  });

  it('17. coverage caps at 100% when history exceeds windowDays', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const coverage = computeCoverage(fortyDaysAgo, now, 30);
    assert.equal(coverage.coveragePct, 100);
    assert.equal(coverage.partialWindow, false);
  });

  it('18. coverage with null firstCheckAt -> 0% and partialWindow true', () => {
    const coverage = computeCoverage(null, new Date(), 30);
    assert.equal(coverage.coveragePct, 0);
    assert.equal(coverage.partialWindow, true);
  });

  it('19. series carries cumulative forward over empty days and last point equals headline consumed percent', () => {
    const from = '2026-11-04T00:00:00.000Z';
    const to = '2026-11-10T00:00:00.000Z';
    // 7 days window (Nov 4 to Nov 10 inclusive = 7 points)
    // 1000 total checks in window, 5 bad checks, target 99.9% -> headline budgetConsumedPct = 500%
    const dailyCounts = [
      { day: '2026-11-04', total: 200, bad: 2 },
      { day: '2026-11-05', total: 200, bad: 0 }, // no bad -> carries forward
      { day: '2026-11-06', total: 0, bad: 0 },   // empty day -> carries forward
      { day: '2026-11-07', total: 200, bad: 1 },
      { day: '2026-11-08', total: 200, bad: 0 },
      { day: '2026-11-09', total: 0, bad: 0 },   // empty day -> carries forward
      { day: '2026-11-10', total: 200, bad: 2 }
    ];

    const headline = computeSloStats({ good: 995, total: 1000, targetPercent: 99.9 });
    const series = buildBurnDownSeries(dailyCounts, from, to, 99.9, 1000);

    assert.equal(series.length, 7);
    assert.equal(series[0].day, '2026-11-04');
    assert.equal(series[0].cumulativeBudgetConsumedPct, 200); // 2 bad / (1000 * 0.001) = 200%

    // Nov 5 (0 bad): cumulative carries forward (200%)
    assert.equal(series[1].day, '2026-11-05');
    assert.equal(series[1].cumulativeBudgetConsumedPct, 200);

    // Nov 6 (empty day, 0 total, 0 bad): cumulative carries forward (200%)
    assert.equal(series[2].day, '2026-11-06');
    assert.equal(series[2].total, 0);
    assert.equal(series[2].cumulativeBudgetConsumedPct, 200);

    // Nov 7 (1 bad -> runningBad = 3): cumulative = 300%
    assert.equal(series[3].day, '2026-11-07');
    assert.equal(series[3].cumulativeBudgetConsumedPct, 300);

    // Nov 8 (0 bad): cumulative = 300%
    assert.equal(series[4].day, '2026-11-08');
    assert.equal(series[4].cumulativeBudgetConsumedPct, 300);

    // Nov 9 (empty day): cumulative = 300%
    assert.equal(series[5].day, '2026-11-09');
    assert.equal(series[5].cumulativeBudgetConsumedPct, 300);

    // Nov 10 (2 bad -> runningBad = 5): cumulative = 500%
    assert.equal(series[6].day, '2026-11-10');
    assert.equal(series[6].cumulativeBudgetConsumedPct, 500);

    // Verify last point equals headline consumed percent!
    assert.equal(series[series.length - 1].cumulativeBudgetConsumedPct, headline.budgetConsumedPct);
  });

  it('20. float noise check for target 99.9 does not produce .0000000000000001 drift', () => {
    // IEEE-754: 100 - 99.9 = 0.09999999999999432
    // Integer thousandths: 100000 - 99900 = 100 exact
    const stats = computeSloStats({ good: 999, total: 1000, targetPercent: 99.9 });
    assert.equal(stats.budgetConsumedPct, 100);
    assert.equal(stats.budgetRemainingPct, 0);

    const burnRate = computeBurnRate(1, 1000, 99.9);
    assert.equal(burnRate, 1.0);
  });

  it('21. series with insufficient data returns null cumulative percent for every day', () => {
    const from = '2026-11-04T00:00:00.000Z';
    const to = '2026-11-10T00:00:00.000Z';
    const series = buildBurnDownSeries([], from, to, 99.9, 5); // 5 < 20
    assert.equal(series.length, 7);
    for (const point of series) {
      assert.equal(point.cumulativeBudgetConsumedPct, null);
    }
  });
});

