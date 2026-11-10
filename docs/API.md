# DevOpsPulse REST API Documentation

Base URL: `/api/v1`  
All protected routes require an authenticated session via the `token` HTTP-only cookie.

---

## 1. Authentication (`/api/v1/auth`)

- `POST /auth/register` - Create account (`{ name, email, password }`), sets session cookie.
- `POST /auth/login` - Authenticate (`{ email, password }`), sets session cookie.
- `POST /auth/logout` - Clear session cookie.
- `GET /auth/me` - Return currently authenticated user profile.

---

## 2. Applications (`/api/v1/applications`)

- `GET /applications` - List monitored applications for account owner with pagination and search.
- `POST /applications` - Register new monitored service (`{ name, url, checkInterval }`).
- `GET /applications/:id` - Application details, current health, uptime, and incident summary.
- `PATCH /applications/:id` - Update application details (`{ name, url, checkInterval, isPaused }`).
- `DELETE /applications/:id` - Remove application and cascades checks/incidents.
- `POST /applications/:id/check` - Manually trigger immediate health check.
- `GET /applications/:id/health-checks` - Health check audit log with pagination.
- `GET /applications/:id/uptime` - Aggregated uptime percentage and latency timeseries (`range=24h|7d|30d`).

---

## 3. Incidents (`/api/v1/incidents`)

- `GET /incidents` - List incidents with status/severity filters and pagination.
- `GET /incidents/:id` - Incident details with chronological timeline of updates.
- `PATCH /incidents/:id/status` - Update incident status (`open`, `investigating`, `identified`, `monitoring`, `resolved`).
- `POST /incidents/:id/updates` - Add manual timeline comment / update message.

---

## 4. Deployments (`/api/v1/deployments`)

- `GET /deployments` - List deployment markers across all services.
- `POST /deployments` or `POST /applications/:id/deployments` - Create deployment marker (`{ applicationId, version, environment, status, description, gitCommit, gitBranch }`).
- `GET /deployments/:id` - Deployment record details.

---

## 5. Analytics & Dashboard (`/api/v1/analytics`)

- `GET /analytics/dashboard` - High-level metrics: overall uptime, active incidents, total checks, 24h trend.

---

## 6. Notifications & Alerting (`/api/v1/notifications`)

Scoped strictly by account owner (`ownerId`). Max 5 notification channels per user.

### Channel Management

#### `GET /api/v1/notifications/channels`
List configured notification channels. Webhook URLs are returned masked (host and masked path). Secrets are completely omitted.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "_id": "6af1e964bba57f48c36c3380",
        "name": "Production Slack Alerts",
        "type": "webhook",
        "enabled": true,
        "events": ["incident_opened", "incident_resolved"],
        "minSeverity": "high",
        "format": "slack",
        "url": "https://webhook.example.com/***"
      }
    ]
  }
}
```

#### `POST /api/v1/notifications/channels`
Create a new notification channel (email or webhook).
For webhook channels, the generated signing secret is returned **exactly once** in this response.

**Request Body (strict):**
```json
{
  "name": "DevOps Slack Channel",
  "type": "webhook",
  "url": "https://webhook.example.com/services/alerts",
  "format": "slack",
  "events": ["incident_opened", "incident_resolved"],
  "minSeverity": "medium",
  "enabled": true
}
```
*Note: If `type === "email"`, `url` and `format` must be omitted. If SMTP is not configured on the server, creating an email channel returns 409.*

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "channel": {
      "_id": "6af1e964bba57f48c36c3380",
      "name": "DevOps Slack Channel",
      "type": "webhook",
      "enabled": true,
      "events": ["incident_opened", "incident_resolved"],
      "minSeverity": "medium",
      "format": "slack",
      "url": "https://webhook.example.com/***"
    },
    "signingSecret": "9f83a...64-char-hex-signing-secret..."
  }
}
```

#### `PATCH /api/v1/notifications/channels/:id`
Update channel configuration.

**Request Body (strict):**
```json
{
  "name": "Updated Alert Channel",
  "enabled": false,
  "minSeverity": "high"
}
```

#### `POST /api/v1/notifications/channels/:id/rotate-secret`
Rotates the webhook HMAC signing secret. Webhook channels only. Returns the new secret **once**.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "channelId": "6af1e964bba57f48c36c3380",
    "signingSecret": "4b72...new-64-char-hex-signing-secret..."
  }
}
```

#### `DELETE /api/v1/notifications/channels/:id`
Deletes the channel and cascades deletion to all associated delivery records.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Notification channel deleted successfully"
}
```

#### `POST /api/v1/notifications/channels/:id/test`
Sends a synchronous test notification through the real dispatch path. Rate limited to 3 requests per minute per user.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "sent",
    "attempts": 1,
    "errorType": null,
    "httpStatus": 200
  }
}
```

### Delivery Logs

#### `GET /api/v1/notifications/deliveries`
Query paginated audit log of alerts dispatched or skipped.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `channelId` (optional filter)
- `status` (`pending`, `sent`, `failed`, `skipped`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "_id": "6af1e964bba57f48c36c3395",
        "channelId": {
          "_id": "6af1e964bba57f48c36c3380",
          "name": "DevOps Slack Channel",
          "type": "webhook"
        },
        "incidentId": "6af1e964bba57f48c36c3370",
        "applicationId": "6af1e964bba57f48c36c3360",
        "event": "incident_opened",
        "status": "sent",
        "skipReason": null,
        "attempts": 1,
        "errorType": null,
        "httpStatus": 200,
        "createdAt": "2026-11-09T18:00:00.000Z",
        "sentAt": "2026-11-09T18:00:01.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "pages": 1,
      "limit": 20
    }
  }
}
```

---

## 7. Webhook Dispatch Specification

### HTTP Headers
- `Content-Type`: `application/json`
- `User-Agent`: `DevOpsPulse/1.0`
- `X-DevOpsPulse-Event`: `incident_opened` | `incident_resolved` | `test`
- `X-DevOpsPulse-Timestamp`: ISO 8601 string (e.g. `2026-11-09T18:00:00.000Z`)
- `X-DevOpsPulse-Signature`: `sha256=<hex_hmac>` calculated over `<timestamp>.<raw_body_json>` using the channel signing secret.

### Generic Webhook Payload
```json
{
  "event": "incident_opened",
  "timestamp": "2026-11-09T18:00:00.000Z",
  "incident": {
    "id": "6af1e964bba57f48c36c3370",
    "title": "Service returned 502 Bad Gateway",
    "severity": "high",
    "status": "open",
    "startedAt": "2026-11-09T17:58:00.000Z",
    "resolvedAt": null,
    "failureCount": 2
  },
  "application": {
    "id": "6af1e964bba57f48c36c3360",
    "name": "Payments Service"
  },
  "link": "http://localhost:5173/incidents/6af1e964bba57f48c36c3370"
}
```

### Slack-Compatible Payload (`format: "slack"`)
```json
{
  "text": "[DevOpsPulse] Incident Opened: Payments Service - Service returned 502 Bad Gateway (high) - http://localhost:5173/incidents/6af1e964bba57f48c36c3370"
}
```

### Webhook Receiver Example (Node.js / Express)

A webhook receiver MUST verify the cryptographic signature using constant-time comparison and enforce replay protection by rejecting timestamps older than 5 minutes:

```javascript
import express from 'express';
import crypto from 'crypto';

const app = express();
const SIGNING_SECRET = process.env.DEVOPSPULSE_WEBHOOK_SECRET;

// Note: Ensure you capture the raw buffer body before JSON parsing
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-devopspulse-signature'];
  const timestamp = req.headers['x-devopspulse-timestamp'];
  const rawBody = req.body.toString('utf8');

  if (!signature || !timestamp) {
    return res.status(401).send('Missing signature or timestamp header');
  }

  // 1. Replay Protection: Reject requests older than 5 minutes (300,000 ms)
  const age = Date.now() - Number(timestamp);
  if (isNaN(age) || age > 5 * 60 * 1000 || age < -60000) {
    return res.status(401).send('Timestamp expired or invalid (possible replay attack)');
  }

  // 2. Compute expected HMAC-SHA256 signature
  const payloadToSign = `${timestamp}.${rawBody}`;
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payloadToSign)
    .digest('hex');

  // 3. Constant-time comparison to protect against timing attacks
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(401).send('Invalid signature');
  }

  // Parse JSON and process event
  const payload = JSON.parse(rawBody);
  console.log(`Received verified event: ${payload.event} for app ${payload.application?.name}`);

  res.status(200).json({ received: true });
});
```

### PowerShell Signature Verification Example

To verify a received webhook payload using the CLI tool without shell-quoting issues, save the raw body with `Set-Content -NoNewline` and pass `--body-file`:

```powershell
# 1. Save the exact raw body without trailing newlines
Set-Content -Path "webhook_body.json" -Value $rawBodyString -NoNewline

# 2. Run the verification script with flags
node scripts/verifyWebhookSignature.mjs `
  --body-file "webhook_body.json" `
  --timestamp "1794243485578" `
  --signature "sha256=48cb32772c0f505fa2b63704ca45d9772840f84cd8d62f069156e5fae78f10df" `
  --secret "your_64_char_signing_secret"
```

