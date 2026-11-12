import http from 'http';
import https from 'https';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { NotificationChannel } from '../models/NotificationChannel.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import { User } from '../models/User.js';
import { shouldNotify } from './notificationRules.js';
import {
  generateWebhookSignature,
  stripCrlf,
  escapeHtml,
  decrypt
} from '../utils/crypto.js';
import { buildSafeLookup, assertSafeUrlSyntax } from './urlSafetyService.js';

// Concurrency queue state for outbound dispatch
let activeDispatches = 0;
const dispatchQueue = [];
const MAX_CONCURRENT_DISPATCHES = 5;

// Retry backoff schedule for transient errors (1s, 5s, 30s)
const RETRY_BACKOFFS = [1000, 5000, 30000];

// Optional dependency injection hook for testing without modifying production SSRF rules
let globalHttpSender = null;
let smtpConfiguredOverride = null;

export function setGlobalHttpSender(sender) {
  globalHttpSender = sender;
}

export function setSmtpConfiguredOverride(val) {
  smtpConfiguredOverride = val;
}

export function isSmtpConfigured() {
  if (smtpConfiguredOverride !== null) return smtpConfiguredOverride;
  return Boolean(env.SMTP_HOST);
}

/**
 * Enqueues a dispatch worker ensuring max 5 concurrent requests in flight.
 */
function enqueueDispatch(fn) {
  return new Promise((resolve, reject) => {
    dispatchQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  while (activeDispatches < MAX_CONCURRENT_DISPATCHES && dispatchQueue.length > 0) {
    activeDispatches++;
    const { fn, resolve, reject } = dispatchQueue.shift();
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeDispatches--;
        processQueue();
      });
  }
}

/**
 * Classifies an outbound webhook error.
 */
function classifyWebhookError(err) {
  if (!err) return 'http_error';
  if (err.code === 'BLOCKED_DESTINATION') return 'blocked_destination';
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return 'dns_error';
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT' || err.message?.includes('timeout')) {
    return 'timeout';
  }
  return 'http_error';
}

/**
 * Dispatches an outbound webhook request with connect-time safe lookup,
 * 5-second timeout, signed headers, and NO redirects followed.
 */
export async function sendWebhookRequest({
  url,
  secret,
  event,
  payloadObject,
  customHttpSender = null
}) {
  if (customHttpSender) {
    return customHttpSender({ url, secret, event, payloadObject });
  }

  return new Promise((resolve) => {
    let parsedUrl;
    try {
      assertSafeUrlSyntax(url);
      parsedUrl = new URL(url);

      if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
        return resolve({
          success: false,
          statusCode: null,
          errorType: 'blocked_destination',
          retryable: false
        });
      }
    } catch {
      return resolve({
        success: false,
        statusCode: null,
        errorType: 'blocked_destination',
        retryable: false
      });
    }

    const rawBody = JSON.stringify(payloadObject);
    const timestamp = Date.now().toString();
    const signature = generateWebhookSignature(secret, timestamp, rawBody);

    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const reqOptions = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
        'User-Agent': 'DevOpsPulse/1.0',
        'X-DevOpsPulse-Event': event,
        'X-DevOpsPulse-Timestamp': timestamp,
        'X-DevOpsPulse-Signature': signature
      },
      lookup: buildSafeLookup(),
      timeout: 5000
    };

    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const req = transport.request(reqOptions, (res) => {
      const statusCode = res.statusCode || 0;

      // Drop response body immediately; never store or inspect outbound body
      res.resume();

      // Explicitly reject redirects (no redirects followed)
      if (statusCode >= 300 && statusCode < 400) {
        return settle({
          success: false,
          statusCode,
          errorType: 'http_error',
          retryable: false
        });
      }

      if (statusCode >= 200 && statusCode < 300) {
        return settle({
          success: true,
          statusCode,
          errorType: null,
          retryable: false
        });
      }

      // 4xx client errors are non-retryable
      if (statusCode >= 400 && statusCode < 500) {
        return settle({
          success: false,
          statusCode,
          errorType: 'http_error',
          retryable: false
        });
      }

      // 5xx server errors are retryable
      return settle({
        success: false,
        statusCode,
        errorType: 'http_error',
        retryable: true
      });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({
        success: false,
        statusCode: null,
        errorType: 'timeout',
        retryable: true
      });
    });

    req.on('error', (err) => {
      const classified = classifyWebhookError(err);
      const isBlocked = classified === 'blocked_destination';
      settle({
        success: false,
        statusCode: null,
        errorType: classified,
        retryable: !isBlocked
      });
    });

    req.write(rawBody);
    req.end();
  });
}

/**
 * Creates a reusable nodemailer transport using environment configuration.
 */
export function getMailTransport(customTransport = null) {
  if (customTransport) return customTransport;

  if (!env.SMTP_HOST) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS
        }
      : undefined
  });
}

/**
 * Dispatches an email alert to the account owner via SMTP.
 */
export async function sendEmailAlert({
  ownerEmail,
  ownerName,
  event,
  incident,
  application,
  slo = null,
  details = {},
  severity = 'low',
  link = null,
  customMailTransport = null
}) {
  const transporter = getMailTransport(customMailTransport);
  if (!transporter) {
    return {
      success: false,
      errorType: 'smtp_error',
      retryable: false
    };
  }

  const isTest = event === 'test';
  const isOpened = event === 'incident_opened';
  const isSlo = event.startsWith('slo_');
  const appName = application?.name || 'Monitored Service';
  const incTitle = incident?.title || 'Service degradation';
  const severityStr = (severity || incident?.severity || 'low').toUpperCase();
  const defaultIncidentUrl = `${env.CLIENT_ORIGIN}/incidents/${incident?._id || ''}`;
  const defaultAppUrl = `${env.CLIENT_ORIGIN}/applications/${application?._id || ''}`;
  const targetUrl = link || (isSlo ? defaultAppUrl : defaultIncidentUrl);

  const safeAppName = escapeHtml(appName);
  const safeTitle = escapeHtml(incTitle);
  const safeSeverity = escapeHtml(severityStr);

  let rawSubject;
  let textBody;
  let htmlHeading;
  let htmlColor;
  let htmlDetails;

  if (isTest) {
    rawSubject = '[DevOpsPulse] TEST: this is a test notification';
    textBody =
      `DevOpsPulse: Test Notification\n\n` +
      `This is a test notification from DevOpsPulse. No real incident exists.\n` +
      `Your notification channel is configured and delivering correctly.\n\n` +
      `Timestamp: ${new Date().toISOString()}\n`;
    htmlHeading = '🧪 Test Notification';
    htmlColor = '#2563eb';
    htmlDetails =
      `<p style="font-size: 15px; margin-bottom: 16px;">` +
      `This is a test notification from DevOpsPulse. <strong>No real incident exists.</strong><br>` +
      `Your alert channel is active and delivering notifications properly.` +
      `</p>`;
  } else if (isSlo) {
    let sloHeadline = '';
    if (event === 'slo_breached') {
      sloHeadline = `availability ${details?.sli ?? '—'}% (target ${slo?.targetPercent ?? '99.9'}%)`;
      htmlHeading = '🚨 SLO Breached';
      htmlColor = '#ba1a1a';
    } else if (event === 'slo_at_risk') {
      sloHeadline = `availability ${details?.sli ?? '—'}% (target ${slo?.targetPercent ?? '99.9'}%)`;
      htmlHeading = '⚠️ SLO at Risk';
      htmlColor = '#b45309';
    } else if (event === 'slo_high_burn_rate') {
      sloHeadline = `burn rate 1h ${details?.burnRate1h ?? '—'}x / 6h ${details?.burnRate6h ?? '—'}x`;
      htmlHeading = '🔥 High Burn Rate Detected';
      htmlColor = details?.level === 'critical' ? '#ba1a1a' : '#d97706';
    } else if (event === 'slo_recovered') {
      sloHeadline = `recovered to ${details?.newStatus || 'operational'}`;
      htmlHeading = '✅ SLO Recovered';
      htmlColor = '#065f46';
    } else if (event === 'slo_budget_replenished') {
      sloHeadline = `budget replenished to ${details?.currentRemainingBudget ?? 100}%`;
      htmlHeading = '✨ SLO Budget Replenished';
      htmlColor = '#065f46';
    } else if (event === 'slo_insufficient_data') {
      sloHeadline = `insufficient data (${details?.totalChecks ?? 0} checks, min 20)`;
      htmlHeading = 'ℹ️ Insufficient SLO Data';
      htmlColor = '#2563eb';
    } else if (event === 'slo_monitoring_unavailable') {
      sloHeadline = `monitoring unavailable (no checks for ${details?.elapsedSeconds ?? 0}s)`;
      htmlHeading = '⚠️ Monitoring Unavailable';
      htmlColor = '#b45309';
    } else if (event === 'slo_monitoring_restored') {
      sloHeadline = `monitoring restored`;
      htmlHeading = '✅ Monitoring Restored';
      htmlColor = '#065f46';
    } else {
      sloHeadline = event;
      htmlHeading = 'SLO Alert';
      htmlColor = '#2563eb';
    }

    const eventTag = event.toUpperCase().replace(/_/g, ' ');
    rawSubject = `[${eventTag}] ${appName}: ${sloHeadline}`;
    textBody =
      `DevOpsPulse SLO Alert: ${eventTag}\n\n` +
      `Service: ${appName}\n` +
      `Severity: ${severityStr}\n` +
      `Details: ${sloHeadline}\n` +
      `Timestamp: ${new Date().toISOString()}\n\n` +
      `View in DevOpsPulse: ${targetUrl}\n`;

    htmlDetails =
      `<p style="font-size: 15px; margin-bottom: 16px;">` +
      `<strong>Service:</strong> ${escapeHtml(appName)}<br>` +
      `<strong>Severity:</strong> <span style="text-transform: uppercase;">${escapeHtml(severityStr)}</span><br>` +
      `<strong>Details:</strong> ${escapeHtml(sloHeadline)}` +
      `</p>` +
      `<div style="margin: 24px 0;">` +
      `<a href="${targetUrl}" style="background: #070d0d; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View in DevOpsPulse</a>` +
      `</div>`;
  } else if (isOpened) {
    rawSubject = `[DevOpsPulse] ${severityStr}: ${appName} is down`;
    textBody =
      `DevOpsPulse Alert: Incident Opened\n\n` +
      `Service: ${appName}\n` +
      `Severity: ${severityStr}\n` +
      `Details: ${incTitle}\n` +
      `Started: ${incident?.startedAt ? new Date(incident.startedAt).toISOString() : new Date().toISOString()}\n\n` +
      `View Incident: ${defaultIncidentUrl}\n`;
    htmlHeading = '🚨 Incident Opened';
    htmlColor = '#ba1a1a';
    htmlDetails =
      `<p style="font-size: 15px; margin-bottom: 16px;">` +
      `<strong>Service:</strong> ${safeAppName}<br>` +
      `<strong>Severity:</strong> <span style="text-transform: uppercase;">${safeSeverity}</span><br>` +
      `<strong>Summary:</strong> ${safeTitle}` +
      `</p>` +
      `<div style="margin: 24px 0;">` +
      `<a href="${defaultIncidentUrl}" style="background: #070d0d; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View in DevOpsPulse</a>` +
      `</div>`;
  } else {
    rawSubject = `[DevOpsPulse] Resolved: ${appName} has recovered`;
    textBody =
      `DevOpsPulse Alert: Incident Resolved\n\n` +
      `Service: ${appName}\n` +
      `Status: Recovered and operational\n` +
      `Resolved: ${incident?.resolvedAt ? new Date(incident.resolvedAt).toISOString() : new Date().toISOString()}\n\n` +
      `View Incident: ${defaultIncidentUrl}\n`;
    htmlHeading = '✅ Incident Resolved';
    htmlColor = '#065f46';
    htmlDetails =
      `<p style="font-size: 15px; margin-bottom: 16px;">` +
      `<strong>Service:</strong> ${safeAppName}<br>` +
      `<strong>Status:</strong> Recovered and operational` +
      `</p>` +
      `<div style="margin: 24px 0;">` +
      `<a href="${defaultIncidentUrl}" style="background: #070d0d; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View in DevOpsPulse</a>` +
      `</div>`;
  }

  const safeSubject = stripCrlf(rawSubject);

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #131b2e; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
    <h2 style="margin-top: 0; color: ${htmlColor};">
      ${htmlHeading}
    </h2>
    ${htmlDetails}
    <hr style="border: none; border-top: 1px solid #eaedff; margin: 24px 0;">
    <p style="font-size: 12px; color: #5a4136; margin: 0;">
      This automated alert was sent by DevOpsPulse to ${escapeHtml(ownerEmail)}.
    </p>
  </div>
</body>
</html>`.trim();

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: ownerEmail,
      subject: safeSubject,
      text: textBody,
      html: htmlBody
    });

    return { success: true, errorType: null, retryable: false };
  } catch (err) {
    return {
      success: false,
      errorType: 'smtp_error',
      retryable: true
    };
  }
}

/**
 * Executes a single channel dispatch with bounded concurrency and retry backoff.
 */
async function executeChannelDispatch({
  channel,
  deliveryId,
  event,
  severity = 'low',
  incident = null,
  application = null,
  slo = null,
  details = {},
  link = null,
  ownerUser,
  sentAtOverride = null,
  customHttpSender = null,
  customMailTransport = null,
  retryBackoffs = RETRY_BACKOFFS
}) {
  let attempts = 0;
  let finalStatus = 'failed';
  let finalErrorType = null;
  let finalHttpStatus = null;
  let finalSentAt = null;

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    await NotificationDelivery.findByIdAndUpdate(deliveryId, { attempts: attempt }).catch(() => {});
    let result;

    if (channel.type === 'email') {
      result = await sendEmailAlert({
        ownerEmail: ownerUser.email,
        ownerName: ownerUser.name,
        event,
        incident,
        application,
        slo,
        details,
        severity,
        link,
        customMailTransport
      });
    } else {
      let plaintextUrl;
      let plaintextSecret;
      try {
        plaintextUrl = decrypt(channel.urlEncrypted);
        plaintextSecret = decrypt(channel.secretEncrypted);
      } catch {
        finalErrorType = 'blocked_destination';
        break;
      }

      let payloadObject;
      const isSlo = event.startsWith('slo_');
      const defaultIncidentLink = event === 'test' ? null : `${env.CLIENT_ORIGIN}/incidents/${incident?._id || ''}`;
      const defaultAppLink = `${env.CLIENT_ORIGIN}/applications/${application?._id || ''}`;
      const targetLink = link || (isSlo ? defaultAppLink : defaultIncidentLink);

      if (channel.format === 'slack') {
        if (event === 'test') {
          payloadObject = {
            text: 'TEST: this is a test notification from DevOpsPulse. No real incident exists.'
          };
        } else if (isSlo) {
          payloadObject = {
            text: `[DevOpsPulse] [${event.toUpperCase()}] ${application?.name || 'Service'} - ${(severity || 'low').toUpperCase()} - ${targetLink}`
          };
        } else {
          const actionText = event === 'incident_opened' ? 'Incident Opened' : 'Incident Resolved';
          payloadObject = {
            text: `[DevOpsPulse] ${actionText}: ${application?.name || 'Service'} - ${incident?.title || ''} (${incident?.severity || 'low'}) - ${targetLink}`
          };
        }
      } else if (isSlo) {
        payloadObject = {
          event,
          severity: severity || 'low',
          application: {
            id: application?._id ? application._id.toString() : null,
            name: application?.name || null
          },
          slo: slo
            ? {
                name: slo.name,
                target: slo.targetPercent,
                windowDays: slo.windowDays
              }
            : null,
          metrics: details || {},
          timestamp: new Date().toISOString(),
          link: targetLink
        };
      } else {
        payloadObject = {
          event,
          timestamp: new Date().toISOString(),
          incident: {
            id: incident?._id ? incident._id.toString() : null,
            title: incident?.title || null,
            severity: incident?.severity || null,
            status: incident?.status || null,
            startedAt: incident?.startedAt || null,
            resolvedAt: incident?.resolvedAt || null,
            failureCount: incident?.failureCount || 0
          },
          application: {
            id: application?._id ? application._id.toString() : null,
            name: application?.name || null
          },
          link: targetLink
        };
      }

      result = await sendWebhookRequest({
        url: plaintextUrl,
        secret: plaintextSecret,
        event,
        payloadObject,
        customHttpSender
      });

      finalHttpStatus = result.statusCode;
    }

    if (result.success) {
      finalStatus = 'sent';
      finalErrorType = null;
      finalSentAt = sentAtOverride ? new Date(sentAtOverride) : new Date();
      break;
    } else {
      finalErrorType = result.errorType;
      if (!result.retryable || attempt === maxAttempts) {
        break;
      }
      // Wait with backoff before next attempt
      const backoffMs = retryBackoffs[attempt - 1] || 1000;
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  // Update delivery record upon completion
  await NotificationDelivery.findByIdAndUpdate(deliveryId, {
    status: finalStatus,
    attempts,
    errorType: finalErrorType,
    httpStatus: finalHttpStatus,
    sentAt: finalSentAt
  });

  return {
    success: finalStatus === 'sent',
    status: finalStatus,
    attempts,
    errorType: finalErrorType,
    httpStatus: finalHttpStatus
  };
}

/**
 * Unified notification entrypoint used by incidents and SLO events.
 * Fire-and-forget: wrapped completely so it NEVER throws or blocks caller.
 */
export async function notifyEvent({
  ownerId,
  application,
  slo = null,
  incident = null,
  type,
  severity = 'low',
  dedupeKey = null,
  details = {},
  link = null,
  options = {}
}) {
  try {
    if (!ownerId || !application) {
      return;
    }

    // Load active notification channels with encrypted secrets
    const channels = await NotificationChannel.find({
      ownerId,
      enabled: true
    }).select('+urlEncrypted +secretEncrypted');

    if (!channels || channels.length === 0) {
      return;
    }

    const now = options.now ? (options.now instanceof Date ? options.now.getTime() : options.now) : Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    // Retrieve rolling hour delivery count for rate limiting
    const sentInLastHour = await NotificationDelivery.countDocuments({
      ownerId,
      status: 'sent',
      createdAt: { $gte: oneHourAgo }
    });

    const isSlo = type.startsWith('slo_');
    const cooldownMinutes = isSlo
      ? (env.SLO_ALERT_COOLDOWN_MINUTES || 30)
      : (env.NOTIFY_COOLDOWN_MINUTES || 5);

    // Retrieve last notification timestamp for this application + event
    let lastNotificationAt = null;
    const lastDelivery = await NotificationDelivery.findOne({
      applicationId: application._id,
      event: type,
      status: 'sent'
    })
      .sort({ createdAt: -1 })
      .select('sentAt createdAt');

    if (lastDelivery) {
      lastNotificationAt = lastDelivery.sentAt || lastDelivery.createdAt;
    }

    // Preload account owner for email channel dispatch
    const ownerUser = await User.findById(ownerId).select('name email');
    if (!ownerUser) {
      return;
    }

    for (const channel of channels) {
      let openDeliveryWasSent = null;

      if (type === 'incident_resolved' && incident?._id) {
        const openedDelivery = await NotificationDelivery.findOne({
          channelId: channel._id,
          incidentId: incident._id,
          event: 'incident_opened'
        }).select('status').lean();

        openDeliveryWasSent = openedDelivery ? openedDelivery.status === 'sent' : false;
      } else if (type === 'slo_recovered') {
        const episode = details?.episode;
        const breachDedupeKey = `${slo?._id || ''}:slo_breached:${episode}`;
        const breachedDelivery = await NotificationDelivery.findOne({
          channelId: channel._id,
          dedupeKey: breachDedupeKey,
          status: 'sent'
        }).select('status').lean();

        openDeliveryWasSent = Boolean(breachedDelivery);
      }

      const ruleResult = shouldNotify({
        channel,
        event: type,
        incident,
        severity,
        lastNotificationAt,
        openDeliveryWasSent,
        sentInLastHour,
        now,
        cooldownMinutes,
        ratePerHour: env.NOTIFY_RATE_PER_HOUR
      });

      if (!ruleResult.notify) {
        // Record skipped delivery in audit trail
        try {
          await NotificationDelivery.create({
            ownerId,
            channelId: channel._id,
            incidentId: incident?._id ?? null,
            applicationId: application._id,
            event: type,
            dedupeKey: dedupeKey ?? null,
            status: 'skipped',
            skipReason: ruleResult.skipReason,
            attempts: 0
          });
        } catch {
          // If already recorded or duplicate key, ignore quietly
        }
        continue;
      }

      // Insert pending delivery with deduplication index
      let deliveryDoc;
      try {
        const createDoc = {
          ownerId,
          channelId: channel._id,
          incidentId: incident?._id ?? null,
          applicationId: application._id,
          event: type,
          dedupeKey: dedupeKey ?? null,
          status: 'pending',
          attempts: 0
        };
        if (options.now) {
          createDoc.createdAt = new Date(options.now);
        }
        deliveryDoc = await NotificationDelivery.create(createDoc);
      } catch (err) {
        // Duplicate key (code 11000) indicates alert already handled: skip quietly
        if (err.code === 11000) {
          continue;
        }
        continue;
      }

      // Enqueue async dispatch with bounded concurrency
      enqueueDispatch(() =>
        executeChannelDispatch({
          channel,
          deliveryId: deliveryDoc._id,
          event: type,
          severity,
          incident,
          application,
          slo,
          details,
          link,
          ownerUser,
          sentAtOverride: options.now,
          customHttpSender: options.customHttpSender || globalHttpSender,
          customMailTransport: options.customMailTransport,
          retryBackoffs: options.retryBackoffs || RETRY_BACKOFFS
        })
      ).catch(() => {});
    }
  } catch (err) {
    // Top-level catch: never propagate notification errors to callers
  }
}

/**
 * Main alerting entrypoint called after incident status mutations.
 * Fire-and-forget: wrapped completely so it NEVER throws or blocks caller.
 */
export async function notifyIncidentEvent(
  incident,
  application,
  event,
  options = {}
) {
  try {
    if (!incident || !application || !incident.ownerId) {
      return;
    }
    return await notifyEvent({
      ownerId: incident.ownerId,
      application,
      incident,
      type: event,
      severity: incident.severity || 'low',
      dedupeKey: null,
      details: {
        title: incident.title,
        failureCount: incident.failureCount,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt
      },
      link: `${env.CLIENT_ORIGIN}/incidents/${incident._id || ''}`,
      options
    });
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Sends a synchronous test notification message for a channel.
 * Rate limited to 3 per minute per user at endpoint level.
 */
export async function sendTestNotification(channel, user, options = {}) {
  const dummyIncident = {
    _id: null,
    title: 'Test Incident Alert from DevOpsPulse',
    severity: channel.minSeverity || 'medium',
    status: 'open',
    startedAt: new Date().toISOString(),
    resolvedAt: null,
    failureCount: 1
  };

  const dummyApp = {
    _id: null,
    name: 'DevOpsPulse Alert Tester'
  };

  // Create delivery record for the test event
  const deliveryDoc = await NotificationDelivery.create({
    ownerId: user._id,
    channelId: channel._id,
    incidentId: null,
    applicationId: null,
    event: 'test',
    status: 'pending',
    attempts: 0
  });

  return executeChannelDispatch({
    channel,
    deliveryId: deliveryDoc._id,
    event: 'test',
    incident: dummyIncident,
    application: dummyApp,
    ownerUser: user,
    customHttpSender: options.customHttpSender || globalHttpSender,
    customMailTransport: options.customMailTransport
  });
}

/**
 * On server start, clean up orphaned pending deliveries older than 2 minutes
 * and mark them as failed with errorType "interrupted".
 */
export async function cleanupInterruptedDeliveries() {
  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    await NotificationDelivery.updateMany(
      {
        status: 'pending',
        createdAt: { $lt: twoMinutesAgo }
      },
      {
        $set: {
          status: 'failed',
          errorType: 'interrupted'
        }
      }
    );
  } catch {
    // Non-fatal
  }
}
