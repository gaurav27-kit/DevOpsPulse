import mongoose from 'mongoose';
import { env } from '../config/env.js';

export const HEALTHCHECK_ERROR_TYPES = [
  'timeout',
  'dns_error',
  'connection_refused',
  'connection_reset',
  'tls_error',
  'http_error',
  'blocked_destination',
  'too_many_redirects',
  'unknown'
];

export const SANITIZED_ERROR_MESSAGES = Object.freeze({
  timeout: 'Request timed out waiting for response',
  dns_error: 'Unable to resolve destination hostname (DNS lookup failed)',
  connection_refused: 'Connection refused by destination server',
  connection_reset: 'Connection reset by peer during handshake or transmission',
  tls_error: 'SSL/TLS certificate verification failed',
  http_error: 'Server returned an unsuccessful HTTP status code',
  blocked_destination: 'Target address blocked by SSRF security policy',
  too_many_redirects: 'Exceeded maximum allowable redirect limit (3)',
  unknown: 'An unexpected network or socket error occurred'
});

const healthCheckSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: [true, 'Health check must reference an application'],
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Health check must reference an owner'],
      index: true
    },
    checkedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    success: {
      type: Boolean,
      required: true
    },
    statusCode: {
      type: Number,
      default: null
    },
    responseTimeMs: {
      type: Number,
      required: true,
      min: 0
    },
    errorType: {
      type: String,
      enum: {
        values: [...HEALTHCHECK_ERROR_TYPES, null],
        message: '{VALUE} is not a valid error type'
      },
      default: null
    },
    errorMessage: {
      type: String,
      default: null,
      maxlength: 300
    }
  },
  {
    timestamps: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for chronological telemetry queries scoped to application
healthCheckSchema.index({ applicationId: 1, checkedAt: -1 });

// TTL expiration index based on configured retention window
// NOTE: MongoDB TTL cleanup runs as a background thread approximately once every 60 seconds
const retentionSeconds = Math.max(1, env.HEALTHCHECK_RETENTION_DAYS) * 24 * 60 * 60;
healthCheckSchema.index({ checkedAt: 1 }, { expireAfterSeconds: retentionSeconds });

export const HealthCheck = mongoose.model('HealthCheck', healthCheckSchema);

