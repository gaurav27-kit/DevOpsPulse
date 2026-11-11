# DevOpsPulse: Product Requirements Document (PRD)

**Version:** 1.2  
**Status:** In Scope / Active  
**Last Updated:** November 2026

---

## 1. Executive Summary & Problem Statement
Engineering and DevOps teams require reliable, real-time observability of production microservices and external web endpoints. Outages and degradations must be surfaced immediately and correlated with recent code deployments. 

In Release 2 (v1.1), **Alerting & Notifications** (email + outbound webhooks) moved into active scope.
In Release 3 (v1.2), **SLO Monitoring** (targets, error budgets, and multi-window burn rate tracking) is introduced to provide quantitative reliability tracking against user-defined service level agreements and prevent alert fatigue.

---

## 2. Target Personas
- **Site Reliability Engineers (SREs):** Need programmatic notifications (webhooks into Slack/incident receivers), quantitative error budget consumption tracking, and burn rate detection.
- **Engineering Managers & Product Owners:** Need clear visibility into service reliability (SLIs vs SLO targets) over 7-day and 30-day windows to balance feature velocity against stability investments.
- **Full-Stack Engineers / Tech Leads:** Need direct email alerts and actionable warnings when error budgets are consumed at dangerous burn rates.

---

## 3. Core Feature Scope

### 3.1 Existing Features (Release 1)
- **User Authentication:** HTTP-only JWT cookie authentication, BCrypt hashing, strict profile boundaries.
- **Application Monitoring:** Continuous periodic health checks (HTTP/HTTPS), latency measurement, status state machine (Unknown, Up, Degraded, Down).
- **Incident Management:** Automated incident creation on 2 consecutive check failures, automated resolution on 2 consecutive check successes, on-call timeline updates.
- **Deployment Auditing:** Tracking code releases, Git commit SHA, branch, and environment correlation with uptime anomalies.
- **Real-Time Dashboards:** WebSocket event-driven cache invalidation for instant multi-user synchronization.

### 3.2 Alerting & Notification Engine (Release 2 - v1.1)
- **Notification Channels:** Up to 5 channels per account owner (`email` or `webhook`).
- **Security & SSRF Hardening:** Syntax validation, DNS check, connect-time IP validation, blocking loopback/private ranges, HTTPS enforced in production, AES-256-GCM encryption at rest.
- **Anti-Flapping & Deduplication:** Cooldown window, hourly rate limits, unique delivery deduplication index.

### 3.3 Service Level Objective (SLO) Monitoring (Release 3 - v1.2 In Scope - Backend)
- **SLI Definition (Check-Count Based):**
  - $\text{SLI} = (\text{good checks} / \text{total recorded checks in window}) \times 100\%$.
  - "Good" check = `HealthCheck.success === true`. Slow checks count as good (consistent with uptime definition).
  - Every recorded check in the window counts; gaps/unmonitored intervals are not counted as up or down.
- **SLO Targets & Rolling Windows:**
  - Target percent: between `90.000%` and `99.999%` (up to 3 decimal places).
  - Rolling evaluation windows: `7` or `30` days.
- **Error Budget Computation:**
  - $\text{errorRate} = \text{bad} / \text{total}$.
  - $\text{allowedErrorRate} = 1 - (\text{targetPercent} / 100) = (100 - \text{targetPercent}) / 100$.
  - $\text{budgetConsumedPct} = (\text{errorRate} / \text{allowedErrorRate}) \times 100$ (can exceed 100% when breached).
  - $\text{budgetRemainingPct} = \max(0, 100 - \text{budgetConsumedPct})$.
- **Status Classification:**
  - `insufficient_data`: total checks in the window < 20 (budget numbers are safe `null`s, preventing false alarms or division-by-zero anomalies).
  - `healthy`: total >= 20 and `budgetConsumedPct < 50%`.
  - `at_risk`: total >= 20 and `50% <= budgetConsumedPct <= 100%` (exactly 100% means the target is exactly met and budget is fully spent).
  - `breached`: total >= 20 and `budgetConsumedPct > 100%` (SLI fallen below target).
- **Window Coverage & Historical Confidence:**
  - $\text{coveragePct} = \min(100, (\text{daysOfData} / \text{windowDays}) \times 100)$, where days of data is measured from the application's first recorded check in the window to current time.
  - If `coveragePct < 50%`, `partialWindow: true` is flagged so consumers know the metrics represent limited history.
- **Burn Rate & Alert Flags:**
  - Lookback windows: 1 hour (`burnRate1h`) and 6 hours (`burnRate6h`).
  - Burn rate over lookback $L = (\text{error rate in last } L) / \text{allowedErrorRate}$ (`null` when no checks recorded in lookback).
  - Flags: `fastBurn = burnRate1h >= 14.4` (burns full 30d budget in ~2 days), `slowBurn = burnRate6h >= 6.0` (burns full budget in 5 days).
  - Derived from Google SRE workbook multi-window guidelines (simplified for check-count models).
- **Burn-Down Timeseries:**
  - Daily UTC buckets from window start to current day (`windowDays` points).
  - Output `{ day: "YYYY-MM-DD", total, bad, cumulativeBudgetConsumedPct }`. Empty days have total 0 and carry cumulative consumption forward.
  - Cumulative consumption is evaluated against total window budget so the final day equals the headline `budgetConsumedPct`.
- **Capacity Limits & Referential Integrity:**
  - One SLO per application (enforced via unique index on `applicationId`).
  - Maximum of 20 SLOs per user account (409 beyond).
  - Deleting an application cascades to permanently delete its associated SLO.

---

## 4. Non-Functional Requirements
- **Performance:** Aggregations must leverage the compound index `{ applicationId: 1, checkedAt: -1 }` with an index scan (`IXSCAN`) and 0 collection scans (`COLLSCAN`), even across 50,000+ checks.
- **Security:** Zero plaintext secrets. Multi-tenant isolation enforced on every route: resources belonging to another user return HTTP 404 (never 403, never data).
- **Precision:** Integer thousandths arithmetic prevents IEEE-754 floating-point drift (e.g. `100 - 99.9` exact).

