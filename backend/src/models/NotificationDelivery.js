import mongoose from 'mongoose';

const notificationDeliverySchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotificationChannel',
      required: true,
      index: true
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      default: null
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null
    },
    event: {
      type: String,
      enum: ['incident_opened', 'incident_resolved', 'test'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
      index: true
    },
    skipReason: {
      type: String,
      enum: ['cooldown', 'rate_limit', 'severity', 'disabled', 'no_open_alert', null],
      default: null
    },
    attempts: {
      type: Number,
      default: 0
    },
    errorType: {
      type: String,
      enum: [
        'timeout',
        'dns_error',
        'http_error',
        'blocked_destination',
        'smtp_error',
        'interrupted',
        null
      ],
      default: null
    },
    httpStatus: {
      type: Number,
      default: null
    },
    sentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Deduplication index: An incident event can only ever have ONE delivery record per channel
notificationDeliverySchema.index(
  { channelId: 1, incidentId: 1, event: 1 },
  {
    unique: true,
    partialFilterExpression: { incidentId: { $type: 'objectId' } }
  }
);

// Fast owner timeline queries
notificationDeliverySchema.index({ ownerId: 1, createdAt: -1 });

// Channel audit trail index
notificationDeliverySchema.index({ channelId: 1, createdAt: -1 });

// TTL index to automatically purge delivery records after 30 days
notificationDeliverySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

export const NotificationDelivery = mongoose.model(
  'NotificationDelivery',
  notificationDeliverySchema
);

