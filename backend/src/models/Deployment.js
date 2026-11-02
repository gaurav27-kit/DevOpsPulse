import mongoose from 'mongoose';

/**
 * Deployment model — records a software deployment event tied to a monitored application.
 *
 * The `source` field distinguishes how this record was created:
 *   "manual" — entered directly by a user via the API (this step).
 *   Future: "webhook" — will be set automatically when a trusted CI/CD integration
 *           (e.g. GitHub Actions, GitLab CI) posts to a verified webhook endpoint (PRD FR-07).
 *   Clients can NEVER set `source` via the API; it is always overridden server-side.
 */
const deploymentSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    version: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    commitSha: {
      type: String,
      default: null,
      // Stored lowercase (normalised at write time)
      maxlength: 40
    },
    branch: {
      type: String,
      default: null,
      maxlength: 100
    },
    environment: {
      type: String,
      enum: ['production', 'staging', 'development'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'success', 'failed', 'rolled_back'],
      default: 'success'
    },

    // Immutable: always set server-side. "manual" = user-entered record.
    // Future values: "webhook" (from a verified CI/CD integration, PRD FR-07).
    source: {
      type: String,
      enum: ['manual'],
      default: 'manual',
      immutable: true
    },

    startedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    completedAt: {
      type: Date,
      default: null
    },
    description: {
      type: String,
      default: null,
      maxlength: 500
    }
  },
  { timestamps: true }
);

// For fetching deployments of a specific application in creation order
deploymentSchema.index({ applicationId: 1, createdAt: -1 });

// For the global deployments list scoped by owner, ordered by deployment time
deploymentSchema.index({ ownerId: 1, startedAt: -1 });

export const Deployment = mongoose.model('Deployment', deploymentSchema);

