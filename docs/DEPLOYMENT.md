# DevOpsPulse Deployment Guide

## Production Environment Variables

### Core Configuration
```ini
PORT=5000
NODE_ENV=production
# Format: mongodb+srv://(username):(password) at (cluster-host)/(database)
MONGO_URI=mongodb+srv://cluster0.mongodb.net/devopspulse?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_key
CLIENT_ORIGIN=https://app.devopspulse.com
```

### Notifications & Alerting (Release 2)

#### 1. Webhook Encryption Key (Required for Notifications)
Outbound webhook URLs and webhook signing secrets are encrypted at rest using AES-256-GCM.
`NOTIFICATION_ENCRYPTION_KEY` must be a 32-byte hexadecimal string (64 characters).

**PowerShell generation command:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Bash / Linux generation command:**
```bash
openssl rand -hex 32
```

> **Warning:** If `NOTIFICATION_ENCRYPTION_KEY` is changed or lost in production, existing stored webhook URLs cannot be decrypted and will be rejected. Always back up this key in your secrets manager.

#### 2. SMTP Configuration (Optional)
If SMTP credentials are provided, email notifications are enabled and sent exclusively to the account owner's email address. If omitted, creating email channels returns `409 Conflict ("Email is not configured on this server")`.

**Generic SMTP (SendGrid, Postmark, AWS SES):**
```ini
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxx
SMTP_FROM=alerts@devopspulse.com
```

**Free Gmail SMTP Setup (via 16-character App Password):**
1. Log into your Google Account -> **Security** -> **2-Step Verification** (must be enabled).
2. Go to [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Enter an app name (e.g. `DevOpsPulse Alerting`) and click **Create**.
4. Copy the generated 16-character passcode (e.g. `abcd efgh ijkl mnop`).
5. Set your `.env` variables:
```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM="DevOpsPulse Alerts <your-email@gmail.com>"
```

#### 3. Notification Rate Limiting & Cooldown
```ini
# Maximum alerts sent per user per rolling 1 hour window (default: 30)
NOTIFY_RATE_PER_HOUR=30

# Anti-flapping cooldown window in minutes for incident_opened on the same service (default: 5)
NOTIFY_COOLDOWN_MINUTES=5
```

---

## Startup Maintenance

On backend startup, DevOpsPulse automatically runs `cleanupInterruptedDeliveries()`. Any notification delivery left in a `pending` state for longer than 2 minutes (e.g. Due to an unexpected server restart or container kill) is marked as `failed` with `errorType: "interrupted"`. Delivery retries are managed in-process and are not durable across server restarts.

