# DevOpsPulse

DevOpsPulse is an application monitoring and incident management platform built with the MERN stack (MongoDB, Express, React, Node.js). It provides automated HTTP/HTTPS health checks, response-time tracking, outage detection, incident workflows, deployment tracking, and a real-time operational dashboard.

## Tech Stack

- **Frontend**: React 18, Vite, React Router v6, TanStack Query v5, Axios, Tailwind CSS v4, Lucide React
- **Backend**: Node.js (ES modules), Express, MongoDB, Mongoose, Zod, bcryptjs, jsonwebtoken, helmet, cors
- **Security**: SSRF protection, tenant isolation scoped by `ownerId`, rate limiting, httpOnly JWT cookies

## Project Structure

```
DevOpsPulse/
├── backend/
│   ├── src/
│   │   ├── config/        # Environment and DB connection
│   │   ├── controllers/   # Request/response handlers
│   │   ├── middleware/    # Auth, validation, error handling, rate limiting
│   │   ├── models/        # Mongoose schemas (User, Application)
│   │   ├── routes/        # Express route definitions
│   │   ├── services/      # Business logic (auth, applications, urlSafety)
│   │   ├── utils/         # AppError, asyncHandler
│   │   ├── app.js         # Express app configuration
│   │   └── server.js      # Server entry point
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/           # Axios instance and API modules
    │   ├── components/    # Reusable UI components and AppLayout
    │   ├── hooks/         # Custom hooks (useAuth)
    │   ├── pages/         # Login, Register, Dashboard, NotFound
    │   ├── routes/        # ProtectedRoute, PublicOnlyRoute
    │   ├── App.jsx
    │   └── main.jsx
    ├── .env.example
    └── package.json
```

## Getting Started

### 1. Backend Setup
```bash
cd backend
cp .env.example .env
# Configure MONGO_URI and JWT_SECRET in .env
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

## Features & Capabilities

- **Automated Health Checks**: HTTP/HTTPS monitoring with configurable intervals (10s to 1h), timeout enforcement, and status classification (up, down, degraded).
- **Incident Management**: State-machine driven incident lifecycle (`open`, `investigating`, `identified`, `monitoring`, `resolved`), timeline notes, and automatic recovery.
- **Deployment Markers**: Correlate deployment events across production and staging with health metrics and response times.
- **Real-Time Telemetry**: WebSocket-driven dashboard updates and live query cache invalidation.
- **Alerting & Notifications (Release 2)**:
  - Outbound notifications for `incident_opened` and `incident_resolved` events.
  - Email alerts via SMTP to the account owner with HTML/plain-text bodies and XSS/header injection protection.
  - Webhooks with HMAC-SHA256 signatures (`X-DevOpsPulse-Signature`) supporting generic JSON and Slack-compatible formats.
  - Defense-in-depth SSRF protection on webhook destinations using connect-time DNS validation (`buildSafeLookup`) and redirect blocking.
  - AES-256-GCM encryption at rest for webhook URLs and secrets.
  - Pure rule engine with minimum severity thresholds, anti-flapping cooldowns (5m), and per-user hourly rate caps (30/hr).
  - Deduplication unique index ensuring zero duplicate alerts per incident event.

- **Service Level Objectives (SLO) Monitoring (Release 3 - End-to-End)**:
  - Check-count based SLI reliability metrics evaluated across 7-day or 30-day rolling windows.
  - User-defined targets between 90.000% and 99.999% (up to 3 decimal places) using integer thousandths arithmetic.
  - Real-time error budget tracking: budget consumed %, budget remaining %, and health classification (`healthy`, `at_risk`, `breached`, `insufficient_data`).
  - Multi-window burn rate tracking over 1-hour (`burnRate1h`) and 6-hour (`burnRate6h`) lookback intervals with fast-burn (`>= 14.4`) and slow-burn (`>= 6.0`) alert flags.
  - Daily UTC burn-down time series with forward carry-over for empty days.
  - Pre-aggregated `HealthCheckDaily` rollups reducing query latency by over 30x with 0 `COLLSCAN` operations across 50,000+ checks.
  - **Full Frontend User Experience**:
    - Dedicated `/slos` overview page featuring a desktop table, mobile card layout, and status filter pills (`all`, `healthy`, `at_risk`, `breached`, `insufficient_data`).
    - Embedded SLO management in `ApplicationDetailsPage`: visual status badge, semi-circular SVG error budget gauge, multi-window burn rate cards with animated fast-burn warning banner, and daily burn-down chart.
    - Zero-friction SLO modal dialog for creating/editing targets and rolling windows with instant TanStack Query cache invalidation.
    - WebSocket real-time live invalidation triggering automatic UI refresh on health check completions and incident events.
    - Fully responsive across desktop (1280px+), tablet, and mobile (360px+) viewports with WCAG AA compliant contrast ratios and minimum 40px touch targets.

### Known Limitations

- **SLO daily rollups architecture & trade-offs**: SLO evaluation utilizes pre-aggregated `HealthCheckDaily` rollups, reducing query latency by over 30x. Current architectural trade-offs: (1) rollups are atomically maintained on each check result by the application process; (2) rollups operate at UTC daily granularity rather than hourly; (3) the initial boundary day `[windowStart, endOfBoundaryDay)` queries raw checks to preserve exact rolling window precision; and (4) only `total` and `good` counts are tracked in rollups, with short lookbacks (1h, 6h burn rates) querying indexed raw checks.
- **In-process, non-durable retries**: Webhook delivery retries (1s, 5s, 30s) are managed in-process with bounded concurrency (max 5 in flight). If the server crashes or restarts mid-flight, pending deliveries older than 2 minutes are marked as `failed` with error type `interrupted` upon restart rather than resumed from an external durable message broker (e.g. RabbitMQ or Redis Streams).
- **Account-owner email only**: Email notifications are dispatched exclusively to the verified account owner's email address. Arbitrary third-party recipients are disallowed by design to prevent open-relay spam abuse.
- **No SMS or native push**: Alerting supports Email and Webhooks only. SMS and mobile push notifications are out of scope for Release 2.
- **Rolling windows only**: SLO evaluation uses rolling 7-day or 30-day lookbacks. Calendar-month and quarterly windows are not supported in MVP.
- **Single availability SLI**: SLOs evaluate check-count availability (`HealthCheck.success === true`). Custom latency-threshold SLIs (e.g., P99 latency < 200ms) and multi-SLO configurations per application are deferred to subsequent releases.

