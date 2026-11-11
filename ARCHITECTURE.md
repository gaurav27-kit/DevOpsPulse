# DevOpsPulse: Architecture and Data Model

This file is the design contract. Code must follow it. If a change is needed, update this file first.

## 1. System architecture

```mermaid
flowchart TD
  subgraph Browser["Browser (React + Vite)"]
    UI[React UI] --> TQ[TanStack Query + Axios]
    UI --> SC[Socket.IO client]
  end
  subgraph Server["Node.js server (one process in MVP)"]
    MW[Middleware: helmet, cors, auth, validate, rate limit]
    CT[Routes and controllers]
    SV[Services: business rules]
    SIO[Socket.IO server]
    subgraph Worker["Monitoring worker"]
      SCH[Scheduler] --> HC[Health checker] --> INC[Incident engine]
    end
    NS[Notification Service: email + webhook]
    MW --> CT --> SV
    INC --> NS
    CT --> NS
  end
  DB[(MongoDB Atlas)]
  EXT[Monitored apps: HTTP/HTTPS URLs]
  HOOK[Outbound Webhooks / Slack]
  SMTP[SMTP Mail Server]

  TQ -- "REST /api/v1" --> MW
  SC -- "WebSocket" --> SIO
  SV --> DB
  INC --> DB
  HC -- "outbound GET, SSRF-safe" --> EXT
  INC -- "emit after DB write" --> SIO
  NS -- "fire-and-forget after DB write" --> DB
  NS -- "signed POST, SSRF-safe" --> HOOK
  NS -- "SMTP TLS" --> SMTP
```

### Layer rules
- Routes only map URLs to controllers. Controllers only parse input and send responses.
- All business logic lives in services. Services never touch `req` or `res`.
- Every query on private data is scoped by `ownerId = req.user._id`.
- Socket.IO events are emitted only AFTER the database write succeeds.
- The scheduler never blocks the API: bounded concurrency, timeouts on every outgoing request.

### Backend folder structure
```
backend/src/
  config/        env.js, db.js
  models/        User, Application, HealthCheck, Incident, Deployment, NotificationChannel, NotificationDelivery, Slo
  middleware/    auth, validate, errorHandler, rateLimiters
  routes/        auth, applications, incidents, deployments, dashboard, notifications, sloRoutes
  controllers/   authController, applicationController, healthCheckController, notificationController, sloController
  services/      authService, applicationService, healthCheckService, statusService, schedulerService, urlSafetyService, notificationService, notificationRules, sloService, sloRules
  sockets/       index.js (auth + rooms + emit helpers)
  utils/         AppError, asyncHandler, crypto
```

### Frontend folder structure
```
frontend/src/
  api/           axios instance + one file per resource
  components/    shared UI (Button, Card, StatusBadge, Table, Pagination)
  features/      auth, applications, incidents, deployments, dashboard, slos
  hooks/         useAuth, useSocket, useApplications, useDebounce
  pages/
  routes/        ProtectedRoute, PublicOnlyRoute
```

## 2. ER diagram

```mermaid
erDiagram
  USER ||--o{ APPLICATION : owns
  USER ||--o{ NOTIFICATION_CHANNEL : configures
  USER ||--o{ NOTIFICATION_DELIVERY : audits
  USER ||--o{ SLO : defines
  APPLICATION ||--o{ HEALTH_CHECK : produces
  APPLICATION ||--o{ INCIDENT : has
  APPLICATION ||--o{ DEPLOYMENT : records
  APPLICATION ||--o| SLO : targets
  APPLICATION ||--o{ NOTIFICATION_DELIVERY : relates
  NOTIFICATION_CHANNEL ||--o{ NOTIFICATION_DELIVERY : logs
  INCIDENT ||--o{ NOTIFICATION_DELIVERY : triggers
  USER {
    ObjectId _id PK
    string name
    string email UK
    string passwordHash
    string role
  }
  APPLICATION {
    ObjectId _id PK
    ObjectId ownerId FK
    string name
    string url
    string environment
    number checkIntervalSeconds
    number timeoutMs
    string status
    number consecutiveFailures
    number consecutiveSuccesses
    date checkLockUntil
    date lastCheckedAt
    date lastSuccessfulAt
    date nextCheckAt
  }
  HEALTH_CHECK {
    ObjectId _id PK
    ObjectId applicationId FK
    ObjectId ownerId FK
    date checkedAt
    boolean success
    number statusCode
    number responseTimeMs
    string errorType
    string errorMessage
  }
  INCIDENT {
    ObjectId _id PK
    ObjectId applicationId FK
    ObjectId ownerId FK
    string title
    string severity
    string status
    date startedAt
    date lastFailureAt
    number failureCount
    date resolvedAt
    array updates
  }
  DEPLOYMENT {
    ObjectId _id PK
    ObjectId applicationId FK
    ObjectId ownerId FK
    string version
    string commitSha
    string branch
    string environment
    string status
    date startedAt
    date completedAt
    string description
  }
  NOTIFICATION_CHANNEL {
    ObjectId _id PK
    ObjectId ownerId FK
    string type
    string name
    boolean enabled
    array events
    string minSeverity
    string urlEncrypted
    string secretEncrypted
    string format
    date createdAt
    date updatedAt
  }
  NOTIFICATION_DELIVERY {
    ObjectId _id PK
    ObjectId ownerId FK
    ObjectId channelId FK
    ObjectId incidentId FK
    ObjectId applicationId FK
    string event
    string status
    string skipReason
    number attempts
    string errorType
    number httpStatus
    date createdAt
    date sentAt
  }
  SLO {
    ObjectId _id PK
    ObjectId ownerId FK
    ObjectId applicationId FK "UNIQUE"
    string name
    number targetPercent
    number windowDays
    date createdAt
    date updatedAt
  }
```

### Data decisions
- `ownerId` is stored on every child collection (denormalized) so each query can be scoped to the user without joins.
- `Incident.updates` is an embedded array: `{ message, author, type, createdAt }`. An incident's notes are always read together with the incident.
- Application `status`: `unknown | up | degraded | down`. Incident `status`: `open | investigating | resolved`.
- Application `consecutiveFailures`: counter to enforce failure threshold before marking `down`.
- Application `consecutiveSuccesses`: counter to enforce recovery threshold (2 consecutive successes required to transition from `down` to `up`).
- Application `checkLockUntil`: atomic distributed lease/lock timestamp preventing overlapping or concurrent checks across scheduler ticks and multi-process workers.
- Deleting an application permanently cascades to delete its health checks, incidents, deployments, and its SLO record (`Slo` collection). It does NOT delete notification deliveries, as deliveries form an immutable audit trail.
- Deleting a `NotificationChannel` cascades to delete its `NotificationDelivery` history records.
- Notification secrets (`urlEncrypted`, `secretEncrypted`) are encrypted with AES-256-GCM. Webhook signing secret is returned only once at creation or rotation.
- Unique index on `NotificationDelivery { channelId, incidentId, event }` enforces exact deduplication so identical alerts are never dispatched twice.
- TTL index of 30 days on `NotificationDelivery.createdAt` automatically purges stale delivery logs.
- Unique index on `Slo { applicationId: 1 }` enforces a 1-to-1 relationship per application in MVP.
- Compound index on `Slo { ownerId: 1, createdAt: -1 }` optimizes user SLO listings.
- User quota: A maximum of 20 SLOs can be configured per account (`ownerId`).
- Query performance: SLO calculation uses MongoDB aggregation leveraging the `{ applicationId: 1, checkedAt: -1 }` index with index scan (`IXSCAN`) and 0 collection scans (`COLLSCAN`).
- Indexes: `User.email` unique; `Application {ownerId, createdAt}`; `HealthCheck {applicationId, checkedAt}` (+ TTL); `Incident {ownerId, status, startedAt}`; `Deployment {applicationId, createdAt}`; `NotificationChannel {ownerId, createdAt}`; `NotificationDelivery {ownerId, createdAt: -1}`; `Slo {applicationId}` unique; `Slo {ownerId, createdAt: -1}`.
- No duplicate active incidents: a partial unique index on `{ applicationId }` where `status` is `open` or `investigating`.

## 3. Monitoring rules (documented, testable)
- New app starts as `unknown`.
- Check success: 2xx/3xx within timeout. Slow success (above 2000 ms) makes the app `degraded`.
- 2 consecutive failures: status `down` and an incident is opened (if none is active).
- Further failures: update the active incident (`failureCount`, `lastFailureAt`).
- 2 consecutive successes: status `up` and the incident is resolved.
- Uptime % = successful checks / total checks in the selected window. Apps with no checks show "no data", not 0%.

## 4. SLO monitoring rules (documented, testable)
- SLI = good checks / total recorded checks in window (`good` = `HealthCheck.success === true`).
- Allowed error rate = `(100 - targetPercent) / 100`.
- Error rate = `bad / total`.
- Budget consumed % = `(errorRate / allowedErrorRate) * 100`.
- Budget remaining % = `max(0, 100 - budgetConsumedPct)`.
- Status: `insufficient_data` (< 20 checks), `healthy` (< 50% consumed), `at_risk` (50% to 100% consumed), `breached` (> 100% consumed).
- Window coverage = `min(100, daysOfData / windowDays * 100)`. If `< 50%`, `partialWindow: true`.
- Burn rate over lookback $L$ = `errorRate_L / allowedErrorRate`. Flags: `fastBurn` (1h >= 14.4), `slowBurn` (6h >= 6.0).
- Burn-down series: UTC daily buckets with cumulative budget consumed relative to total window budget. Empty days carry forward previous cumulative value.

