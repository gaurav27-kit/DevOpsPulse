import mongoose from 'mongoose';
import { decrypt, maskWebhookUrl } from '../utils/crypto.js';

const notificationChannelSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['email', 'webhook'],
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 60
    },
    enabled: {
      type: Boolean,
      default: true
    },
    events: {
      type: [String],
      enum: [
        'incident_opened',
        'incident_resolved',
        'slo_at_risk',
        'slo_breached',
        'slo_high_burn_rate',
        'slo_recovered',
        'slo_budget_replenished',
        'slo_insufficient_data',
        'slo_monitoring_unavailable',
        'slo_monitoring_restored'
      ],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one event subscription is required.'
      },
      required: true
    },
    minSeverity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    // Webhook specific encrypted storage (omitted from API responses)
    urlEncrypted: {
      type: String,
      default: null,
      select: false
    },
    secretEncrypted: {
      type: String,
      default: null,
      select: false
    },
    format: {
      type: String,
      enum: ['generic', 'slack'],
      default: 'generic'
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.urlEncrypted;
        delete ret.secretEncrypted;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Composite index for fast owner channel retrieval ordered by creation
notificationChannelSchema.index({ ownerId: 1, createdAt: -1 });

/**
 * Helper to safely decrypt the webhook URL.
 */
notificationChannelSchema.methods.getDecryptedUrl = function () {
  if (!this.urlEncrypted) return null;
  return decrypt(this.urlEncrypted);
};

/**
 * Helper to safely decrypt the webhook signing secret.
 */
notificationChannelSchema.methods.getDecryptedSecret = function () {
  if (!this.secretEncrypted) return null;
  return decrypt(this.secretEncrypted);
};

/**
 * Helper to format channel for public API response with masked URL.
 */
notificationChannelSchema.methods.toPublicJSON = function () {
  const json = this.toJSON();
  if (this.type === 'webhook' && this.urlEncrypted) {
    try {
      const plaintextUrl = decrypt(this.urlEncrypted);
      json.url = maskWebhookUrl(plaintextUrl);
    } catch {
      json.url = '***';
    }
  }
  return json;
};

export const NotificationChannel = mongoose.model(
  'NotificationChannel',
  notificationChannelSchema
);

