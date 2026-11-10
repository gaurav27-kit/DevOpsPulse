import net from 'net';
import dns from 'dns';
import { AppError } from '../utils/AppError.js';

const MAX_URL_LENGTH = 2048;

/**
 * Checks whether an IPv4 address falls in a private/special/loopback range.
 * Ranges blocked: 0.0.0.0/8, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
 * 192.168.0.0/16, 169.254.0.0/16 (cloud metadata), 100.64.0.0/10 (CGNAT).
 */
const isPrivateIPv4 = (ip) => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;          // 0.0.0.0/8
  if (a === 127) return true;        // 127.0.0.0/8 loopback
  if (a === 10) return true;         // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local + metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
};

/**
 * Checks whether an IPv6 address is loopback, unique-local, or link-local.
 * Also handles IPv4-mapped IPv6 (::ffff:a.b.c.d) by extracting the embedded IPv4.
 */
const isPrivateIPv6 = (ip) => {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;       // loopback/unspecified
  if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:|^fc::|^fd::/i.test(lower)) return true; // fc00::/7 ULA
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;      // fe80::/10 link-local

  // Handle IPv4-mapped IPv6: ::ffff:a.b.c.d or ::ffff:hex.hex
  const mappedMatch = lower.match(/^(?:::ffff:)([\d.]+)$/);
  if (mappedMatch) {
    return isPrivateIPv4(mappedMatch[1]);
  }
  // Also handle compact hex form ::ffff:7f00:1 etc
  if (lower.startsWith('::ffff:')) return true;

  return false;
};

/**
 * Shared utility: returns true if the given IP string is private, loopback,
 * link-local, or otherwise forbidden. Works for both IPv4 and IPv6.
 * Used by both validation-time DNS checks and connect-time lookup hooks.
 */
export const isPrivateOrSpecialIp = (ip) => {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) return isPrivateIPv4(ip);
  if (ipVersion === 6) return isPrivateIPv6(ip);
  return true; // unrecognized format: block by default
};

/**
 * Builds a safe custom lookup function for http/https request options.
 * For EVERY DNS resolution it re-validates the returned IP addresses against
 * private/special ranges. This closes the DNS-rebinding gap: a domain might
 * resolve to a safe IP at configuration time but be rebind to 127.0.0.1 later.
 */
export const buildSafeLookup = () => {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, ...options }, (err, addresses) => {
      if (err) return callback(err);

      const blocked = addresses.find((a) => isPrivateOrSpecialIp(a.address));
      if (blocked) {
        const ssrfErr = new Error(
          `Blocked: '${hostname}' resolved to a private/restricted address`
        );
        ssrfErr.code = 'BLOCKED_DESTINATION';
        return callback(ssrfErr);
      }

      if (options?.all) {
        callback(null, addresses);
      } else {
        const { address, family } = addresses[0];
        callback(null, address, family);
      }
    });
  };
};

/**
 * Validates URL syntax and enforces SSRF-safe structural rules.
 * - Only http: and https: protocols allowed.
 * - No embedded credentials (user:pass@host).
 * - Max 2048 characters.
 * - Forbidden hostname literals: localhost, *.local, *.internal.
 * - Literal private/loopback IP addresses rejected.
 * - URL is normalized (lowercase hostname, fragment stripped).
 *
 * NOTE: A hostname that passes this check can still resolve to a private IP.
 * DNS resolution check is performed in assertSafeDestination().
 *
 * @param {string} rawUrl - Input URL to validate
 * @returns {string} Normalized safe URL
 * @throws {AppError} 400 if URL violates any constraint
 */
export const assertSafeUrlSyntax = (rawUrl) => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new AppError('A valid URL is required', 400, [
      { field: 'url', message: 'A valid URL is required' }
    ]);
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError(`URL length must not exceed ${MAX_URL_LENGTH} characters`, 400, [
      { field: 'url', message: `URL length must not exceed ${MAX_URL_LENGTH} characters` }
    ]);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError('Invalid URL format. Must include protocol (e.g., https://example.com)', 400, [
      { field: 'url', message: 'Invalid URL format. Must include protocol (e.g., https://example.com)' }
    ]);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Only http: and https: protocols are permitted', 400, [
      { field: 'url', message: 'Only http: and https: protocols are permitted' }
    ]);
  }

  if (parsed.username || parsed.password) {
    throw new AppError('URLs with embedded credentials (username/password) are not permitted', 400, [
      { field: 'url', message: 'URLs with embedded credentials (username/password) are not permitted' }
    ]);
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new AppError(`Forbidden hostname: requests to '${hostname}' are not permitted`, 400, [
      { field: 'url', message: `Forbidden hostname: requests to '${hostname}' are not permitted` }
    ]);
  }

  // Reject literal IPs that are private/special
  const ipVersion = net.isIP(cleanHost);
  if (ipVersion !== 0 && isPrivateOrSpecialIp(cleanHost)) {
    throw new AppError('Forbidden destination: private or local IP addresses are not permitted', 400, [
      { field: 'url', message: 'Forbidden destination: private or local IP addresses are not permitted' }
    ]);
  }

  parsed.hash = '';
  return parsed.toString();
};

/**
 * Full async SSRF validation: syntax check + DNS resolution check.
 * Called on application create and URL update.
 *
 * If the hostname cannot be resolved (ENOTFOUND), we ALLOW creation—the
 * site may be temporarily down, and the health-check will record dns_error.
 *
 * If ANY resolved address is private/special, we reject with 400 under the 'url' field.
 *
 * IMPORTANT: A domain that resolves to a safe IP at validation time can later
 * rebind to a private IP (DNS rebinding attack). The health-check executor
 * therefore re-validates every resolved address at connect time using a custom
 * 'lookup' hook—see healthCheckService.js.
 *
 * @param {string} rawUrl - Input URL to validate
 * @returns {string} Normalized safe URL
 * @throws {AppError} 400 if the URL is unsafe
 */
export const assertSafeDestination = async (rawUrl) => {
  const normalizedUrl = assertSafeUrlSyntax(rawUrl);

  const hostname = new URL(normalizedUrl).hostname.replace(/^\[|\]$/g, '');

  // Skip DNS check if hostname is already a raw IP (already checked by syntax function above)
  if (net.isIP(hostname) !== 0) {
    return normalizedUrl;
  }

  let addresses;
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      // Unresolvable hostname: allow creation, health checker will record dns_error
      return normalizedUrl;
    }
    // Other DNS errors (SERVFAIL etc): allow with caution, health checker will handle
    return normalizedUrl;
  }

  const blockedAddress = addresses.find((entry) => isPrivateOrSpecialIp(entry.address));
  if (blockedAddress) {
    throw new AppError(
      'Forbidden destination: the hostname resolves to a private or restricted IP address',
      400,
      [{ field: 'url', message: 'Forbidden destination: the hostname resolves to a private or restricted IP address' }]
    );
  }

  return normalizedUrl;
};
