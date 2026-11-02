import net from 'net';
import { AppError } from '../utils/AppError.js';

const MAX_URL_LENGTH = 2048;

/**
 * Validates whether an IPv4 address falls within private, loopback, link-local,
 * or carrier-grade NAT address ranges.
 */
const isPrivateIPv4 = (ip) => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [a, b] = parts;

  // 0.0.0.0/8 (Broadcast/unspecified)
  if (a === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata, e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Shared address / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
};

/**
 * Validates whether an IPv6 address falls within loopback, unique-local, or link-local ranges.
 */
const isPrivateIPv6 = (ip) => {
  const normalized = ip.toLowerCase();

  // ::1 loopback or :: unspecified
  if (normalized === '::1' || normalized === '::') return true;

  // fc00::/7 (Unique Local Address)
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized) || /^f[cd]:/i.test(normalized)) return true;

  // fe80::/10 (Link-Local Address)
  if (/^fe[89ab][0-9a-f]:/i.test(normalized) || /^fe[89ab]:/i.test(normalized)) return true;

  return false;
};

/**
 * Enforces URL safety syntax rules to defend against Server-Side Request Forgery (SSRF).
 *
 * NOTE: This function performs SYNTAX-LEVEL validation at configuration time.
 * In Step 5 (health checks), outbound requests must also perform runtime DNS-resolution
 * and redirect checks because public domain names can resolve to private IP addresses (DNS rebinding).
 *
 * @param {string} rawUrl - The input URL to validate
 * @returns {string} - The sanitized and normalized URL
 * @throws {AppError} - If the URL violates safety constraints
 */
export const assertSafeUrlSyntax = (rawUrl) => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new AppError('A valid URL is required', 400);
  }

  const trimmed = rawUrl.trim();

  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError(`URL length must not exceed ${MAX_URL_LENGTH} characters`, 400);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError('Invalid URL format. Must include protocol (e.g., https://example.com)', 400);
  }

  // Enforce http/https protocols only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Only http: and https: protocols are permitted', 400);
  }

  // Reject embedded credentials (user:password@hostname)
  if (parsed.username || parsed.password) {
    throw new AppError('URLs with embedded credentials (username/password) are not permitted', 400);
  }

  // Normalize hostname: lowercase, remove brackets if IPv6
  const hostname = parsed.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  // Reject internal/loopback hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new AppError(`Forbidden hostname: requests to '${hostname}' are not permitted`, 400);
  }

  // Detect and reject literal IP addresses targeting private or special ranges
  const ipVersion = net.isIP(cleanHost);
  if (ipVersion === 4 && isPrivateIPv4(cleanHost)) {
    throw new AppError(`Forbidden destination: private or local IPv4 addresses are not permitted`, 400);
  }

  if (ipVersion === 6 && isPrivateIPv6(cleanHost)) {
    throw new AppError(`Forbidden destination: private or local IPv6 addresses are not permitted`, 400);
  }

  // Strip hash fragment before storing
  parsed.hash = '';

  return parsed.toString();
};

