import mongoose from 'mongoose';

/**
 * Update sub-document: represents a single timeline entry for an incident.
 * Types:
 *  - system       : automated entries (opened, resolved, URL changed)
 *  - note         : manual note added by a user
 *  - status_change: user changed the incident status
 */
const incidentUpdateSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    type: {
      type: String,
      enum: ['system', 'note', 'status_change'],
      required: true
    },
    // author is null for system-generated updates; ObjectId for user actions
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const incidentSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 200
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open'
    },

    /**
     * isActive is true while status is open or investigating, false when resolved.
     *
     * WHY isActive instead of filtering on status values in the unique index:
     * MongoDB partial index filters only support simple field comparisons (==, >, <, etc.)
     * and $exists — not $in or $or over multiple values. To enforce "at most one
     * non-resolved incident per application" we need a single boolean flag so the
     * partial index filter is simply { isActive: true }. Filtering on
     * { status: { $in: ["open","investigating"] } } is not supported in partial indexes.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    startedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    lastFailureAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    failureCount: {
      type: Number,
      default: 1,
      min: 1
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    updates: {
      type: [incidentUpdateSchema],
      default: []
    }
  },
  { timestamps: true }
);

// Compound index for list queries (ownerId + status + recency)
incidentSchema.index({ ownerId: 1, status: 1, startedAt: -1 });

/**
 * UNIQUE PARTIAL INDEX: enforces at most one ACTIVE incident per application.
 *
 * partialFilterExpression: { isActive: true }
 * → the index only covers documents where isActive is true.
 * → resolved incidents (isActive: false) are invisible to this index and can accumulate.
 *
 * Without this, two concurrent scheduler workers could both decide to open an incident
 * for the same application and both succeed. The unique index makes the second insert
 * fail with error code 11000 (duplicate key), which incidentService catches and converts
 * to an "update" instead — ensuring exactly one active incident at all times.
 */
incidentSchema.index(
  { applicationId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'unique_active_incident_per_app'
  }
);

export const Incident = mongoose.model('Incident', incidentSchema);
