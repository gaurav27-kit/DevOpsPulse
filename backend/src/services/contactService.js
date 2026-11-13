import { ContactMessage } from '../models/ContactMessage.js';
import { env } from '../config/env.js';
import { getMailTransport } from './notificationService.js';
import { stripCrlf } from '../utils/crypto.js';

/**
 * Strips non-printable ASCII control characters while preserving standard whitespace (\t, \n).
 */
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Handles submission of a contact form message.
 *
 * Honeypot: If website is present, silently discards without storing to DB or sending email.
 * Persistence: Strips control characters and ensures no raw HTML execution.
 * Notification: If SMTP & CONTACT_TO_EMAIL configured, dispatches plain-text alert to fixed admin recipient.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.message
 * @param {string} [params.website]
 * @returns {Promise<{ stored: boolean, id?: string }>}
 */
export async function submitContactMessage({ name, email, message, website }) {
  // Honeypot check: If website field is populated, bot detected
  if (website && typeof website === 'string' && website.trim().length > 0) {
    return { stored: false };
  }

  // Clean inputs
  const cleanName = sanitizeText(name);
  const cleanEmail = sanitizeText(email).toLowerCase();
  const cleanMessage = sanitizeText(message);

  // Store in database with status 'new'
  const savedDoc = await ContactMessage.create({
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
    status: 'new'
  });

  const smtpHost = process.env.SMTP_HOST || env.SMTP_HOST;
  const contactToEmail = process.env.CONTACT_TO_EMAIL || env.CONTACT_TO_EMAIL;

  // Attempt optional SMTP notification if configured
  if (smtpHost && contactToEmail) {
    try {
      const transport = getMailTransport();
      if (transport) {
        // Strip CR/LF from all headers to prevent header injection
        const safeName = stripCrlf(cleanName);
        const safeSenderEmail = stripCrlf(cleanEmail);
        const safeRecipient = stripCrlf(contactToEmail);
        const safeSubject = stripCrlf(`[DevOpsPulse Contact] New inquiry from ${safeName}`);

        await transport.sendMail({
          from: env.SMTP_FROM,
          to: safeRecipient,
          replyTo: safeSenderEmail,
          subject: safeSubject,
          text: `You have received a new contact inquiry via DevOpsPulse.\n\n` +
                `From: ${safeName} <${safeSenderEmail}>\n` +
                `Date: ${new Date().toISOString()}\n\n` +
                `Message:\n${cleanMessage}\n`
        });
      }
    } catch (mailErr) {
      // SMTP failures must NEVER fail the customer request
      console.error('[Contact] Failed to dispatch contact notification email:', mailErr.message);
    }
  }

  return { stored: true, id: savedDoc._id };
}
