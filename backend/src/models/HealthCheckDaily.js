/**
 * backend/src/models/HealthCheckDaily.js
 *
 * Daily aggregated rollup document for health check telemetry.
 * Maintained atomically on check ingestion and used by SLO evaluation
 * to avoid scanning tens of thousands of raw health check documents.
 */

import mongoose from 'mongoose';
import { env } from '../config/env.js';

const healthCheckDailySchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: [true, 'Daily rollup must reference an application'],
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Daily rollup must reference an owner']
    },
    day: {
      type: Date,
      required: [true, 'Day is required (UTC midnight)']
    },
    total: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    good: {
      type: Number,
      required: true,
      default: 0,
      min: 0
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

// Unique compound index: exactly one rollup document per application per UTC calendar day
healthCheckDailySchema.index({ applicationId: 1, day: 1 }, { unique: true });

// Compound index for tenant-level queries and aggregations across applications
healthCheckDailySchema.index({ ownerId: 1, day: 1 });

/**
 * TTL Expiration Index:
 * Documents expire after HEALTHCHECK_RETENTION_DAYS + 7 days buffer.
 * SAFETY RULE: Must NEVER expire documents still inside the 30-day SLO window.
 * Math.max(37, ...) ensures even if HEALTHCHECK_RETENTION_DAYS is misconfigured lower,
 * documents within a 30-day SLO window + 7-day grace margin are safely retained.
 */
const retentionDays = Math.max(37, (Number(env.HEALTHCHECK_RETENTION_DAYS) || 30) + 7);
const retentionSeconds = retentionDays * 24 * 60 * 60;
healthCheckDailySchema.index({ day: 1 }, { expireAfterSeconds: retentionSeconds });

export const HealthCheckDaily = mongoose.model('HealthCheckDaily', healthCheckDailySchema);

