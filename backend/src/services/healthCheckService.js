import http from 'http';
import https from 'https';
import dns from 'dns';
import { performance } from 'perf_hooks';
import { isPrivateOrSpecialIp, assertSafeUrlSyntax, buildSafeLookup } from './urlSafetyService.js';
import { SANITIZED_ERROR_MESSAGES } from '../models/HealthCheck.js';

const MAX_REDIRECTS = 3;

/**
 * Classifies a Node.js error code into a known errorType string.
 */
const classifyError = (err) => {
  if (!err) return 'unknown';
  const code = err.code || '';

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NONAME') return 'dns_error';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (code === 'ECONNRESET') return 'connection_reset';
  if (
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    err.message?.includes('certificate') ||
    err.message?.includes('SSL')
  ) return 'tls_error';
  if (code === 'BLOCKED_DESTINATION') return 'blocked_destination';
  if (code === 'TOO_MANY_REDIRECTS') return 'too_many_redirects';
  return 'unknown';
};

/**
 * Performs a single outbound HTTP/HTTPS health check for an application.
 *
 * Key design decisions:
 * - Uses Node's built-in http/https — no new dependencies.
 * - Custom 'lookup' hook validates resolved IPs at connect time (DNS rebinding protection).
 * - Only issues a GET and destroys the response body immediately after headers arrive.
 * - Manually follows up to MAX_REDIRECTS redirects, re-validating each hop.
 * - Hard timeout via an overall AbortController-like timer that destroys the request.
 * - Never throws for network errors: always returns a classified result object.
 *
 * @param {object} application - Application document
 * @returns {{ success, statusCode, responseTimeMs, errorType, errorMessage }}
 */
export async function runHealthCheck(application) {
  const { url, timeoutMs } = application;
  const startTime = performance.now();
  const safeLookup = buildSafeLookup();

  const makeRequest = (targetUrl, redirectsLeft) => {
    return new Promise((resolve) => {
      let settled = false;

      const settle = (result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      // Validate redirect target URL syntax and protocol before connecting
      let parsedUrl;
      try {
        assertSafeUrlSyntax(targetUrl);
        parsedUrl = new URL(targetUrl);
      } catch (err) {
        const errType = err.message?.includes('blocked') ? 'blocked_destination' : 'blocked_destination';
        return settle({
          success: false,
          statusCode: null,
          responseTimeMs: Math.round(performance.now() - startTime),
          errorType: errType,
          errorMessage: SANITIZED_ERROR_MESSAGES[errType]
        });
      }

      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const reqOptions = {
        method: 'GET',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'DevOpsPulse/1.0'
        },
        lookup: safeLookup,
        timeout: timeoutMs
      };

      const req = lib.request(reqOptions, (res) => {
        const statusCode = res.statusCode;

        // Handle redirects manually
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          res.destroy(); // Don't download body of redirect

          if (redirectsLeft <= 0) {
            return settle({
              success: false,
              statusCode,
              responseTimeMs: Math.round(performance.now() - startTime),
              errorType: 'too_many_redirects',
              errorMessage: SANITIZED_ERROR_MESSAGES.too_many_redirects
            });
          }

          let nextUrl;
          try {
            nextUrl = new URL(res.headers.location, targetUrl).toString();
          } catch {
            return settle({
              success: false,
              statusCode,
              responseTimeMs: Math.round(performance.now() - startTime),
              errorType: 'blocked_destination',
              errorMessage: SANITIZED_ERROR_MESSAGES.blocked_destination
            });
          }

          // Follow redirect with the same timeout budget (measured from overall start)
          return makeRequest(nextUrl, redirectsLeft - 1).then(settle);
        }

        // Immediately destroy the body: we only care about status/time, not content
        res.destroy();
        const responseTimeMs = Math.round(performance.now() - startTime);
        const success = statusCode >= 200 && statusCode < 400;

        settle({
          success,
          statusCode,
          responseTimeMs,
          errorType: success ? null : 'http_error',
          errorMessage: success ? null : SANITIZED_ERROR_MESSAGES.http_error
        });
      });

      // Overall timeout guard
      const hardTimer = setTimeout(() => {
        req.destroy();
        settle({
          success: false,
          statusCode: null,
          responseTimeMs: Math.round(performance.now() - startTime),
          errorType: 'timeout',
          errorMessage: SANITIZED_ERROR_MESSAGES.timeout
        });
      }, timeoutMs);

      req.on('timeout', () => {
        req.destroy();
        clearTimeout(hardTimer);
        settle({
          success: false,
          statusCode: null,
          responseTimeMs: Math.round(performance.now() - startTime),
          errorType: 'timeout',
          errorMessage: SANITIZED_ERROR_MESSAGES.timeout
        });
      });

      req.on('error', (err) => {
        clearTimeout(hardTimer);
        const errorType = classifyError(err);
        settle({
          success: false,
          statusCode: null,
          responseTimeMs: Math.round(performance.now() - startTime),
          errorType,
          errorMessage: SANITIZED_ERROR_MESSAGES[errorType] || SANITIZED_ERROR_MESSAGES.unknown
        });
      });

      req.on('close', () => clearTimeout(hardTimer));
      req.end();
    });
  };

  try {
    return await makeRequest(url, MAX_REDIRECTS);
  } catch (err) {
    // Should never reach here since makeRequest always resolves, but safeguard anyway
    const errorType = classifyError(err);
    return {
      success: false,
      statusCode: null,
      responseTimeMs: Math.round(performance.now() - startTime),
      errorType,
      errorMessage: SANITIZED_ERROR_MESSAGES[errorType] || SANITIZED_ERROR_MESSAGES.unknown
    };
  }
}

