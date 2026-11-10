# DevOpsPulse: Product Requirements Document (PRD)

**Version:** 1.1  
**Status:** In Scope / Active  
**Last Updated:** November 2026

---

## 1. Executive Summary & Problem Statement
Engineering and DevOps teams require reliable, real-time observability of production microservices and external web endpoints. Outages and degradations must be surfaced immediately and correlated with recent code deployments. 

In Release 2 (v1.1), **Alerting & Notifications** (email + outbound webhooks) moves from future consideration into active scope, empowering teams to receive immediate, secure notifications when incidents are triggered or resolved without requiring continuous manual dashboard observation.

---

## 2. Target Personas
- **Site Reliability Engineers (SREs):** Need programmatic notifications (e.g. webhooks into Slack or custom incident receivers) with cryptographic verification and guaranteed SSRF security.
- **Full-Stack Engineers / Tech Leads:** Need direct email alerts delivered exclusively to their registered account address when a mission-critical service goes down or recovers.

---

## 3. Core Feature Scope

### 3.1 Existing Features (Release 1)
- **User Authentication:** HTTP-only JWT cookie authentication, BCrypt hashing, strict profile boundaries.
- **Application Monitoring:** Continuous periodic health checks (HTTP/HTTPS), latency measurement, status state machine (Unknown, Up, Degraded, Down).
- **Incident Management:** Automated incident creation on 2 consecutive check failures, automated resolution on 2 consecutive check successes, on-call timeline updates.
- **Deployment Auditing:** Tracking code releases, Git commit SHA, branch, and environment correlation with uptime anomalies.
- **Real-Time Dashboards:** WebSocket event-driven cache invalidation for instant multi-user synchronization.

### 3.2 Alerting & Notification Engine (Release 2 - v1.1 In Scope)
- **Notification Channels:**
  - Up to 5 channels per account owner (`ownerId` scoped).
  - Supported channel types: `email` (account owner's email address only) and `webhook` (generic JSON payload or Slack-compatible format).
  - Event subscriptions: `incident_opened`, `incident_resolved` (at least one required).
  - Minimum severity filters: `low`, `medium`, `high`, `critical`.
- **Security & SSRF Hardening:**
  - Webhooks enforce identical SSRF protections as health checks: syntax validation, DNS resolution checks, connect-time IP validation, blocking loopback/private/cloud-metadata ranges, and refusing HTTP redirects.
  - Production requires HTTPS for all webhook endpoints.
  - Secrets (webhook URLs and signing secrets) are encrypted with AES-256-GCM at rest and never exposed in plaintext via the API (signing secret returned once at creation/rotation).
- **Spam & Flapping Protection:**
  - Anti-flapping cooldown: `incident_opened` events for the same application within the cooldown period (default 5 minutes) are skipped.
  - Per-user hourly rate cap: maximum notifications per hour (default 30).
  - Duplicate delivery deduplication: unique database index ensures an identical event for an incident is delivered at most once per channel.
- **Reliability & Concurrency:**
  - Non-blocking / fire-and-forget: notification dispatches run asynchronously after database commits and socket emissions.
  - Bounded concurrency (up to 5 concurrent dispatches).
  - Exponential retry backoff (1s, 5s, 30s) for transient network and 5xx errors; 4xx errors and blocked destinations fail immediately without retry.
  - Delivery audit trail: historical delivery logs with sanitized error codes.

---

## 4. Non-Functional Requirements
- **Performance:** Outbound alerting must add 0 ms latency to health check worker loops and API request threads.
- **Security:** Zero plaintext secrets in database documents or logs. Cryptographic verification via `X-DevOpsPulse-Signature` (HMAC-SHA256).
- **Data Isolation:** Complete multi-tenant isolation. All channel configurations and delivery logs are strictly scoped by `ownerId`.

