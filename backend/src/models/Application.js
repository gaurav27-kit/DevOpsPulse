import mongoose from 'mongoose';

/**
 * Application schema matching the design contract in ARCHITECTURE.md
 */
const applicationSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Application must belong to a user'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Application name is required'],
      trim: true,
      maxlength: [60, 'Application name cannot exceed 60 characters']
    },
    url: {
      type: String,
      required: [true, 'Monitored URL is required'],
      trim: true
    },
    environment: {
      type: String,
      enum: {
        values: ['production', 'staging', 'development'],
        message: '{VALUE} is not a supported environment'
      },
      default: 'production'
    },
    checkIntervalSeconds: {
      type: Number,
      required: true,
      default: 300,
      min: [30, 'Interval must be at least 30 seconds'],
      max: [3600, 'Interval cannot exceed 3600 seconds']
    },
    timeoutMs: {
      type: Number,
      required: true,
      default: 10000,
      min: [1000, 'Timeout must be at least 1000 ms'],
      max: [30000, 'Timeout cannot exceed 30000 ms']
    },
    status: {
      type: String,
      enum: {
        values: ['unknown', 'up', 'degraded', 'down'],
        message: '{VALUE} is not a valid application status'
      },
      default: 'unknown'
    },
    lastCheckedAt: {
      type: Date,
      default: null
    },
    lastSuccessfulAt: {
      type: Date,
      default: null
    },
    nextCheckAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for efficient owner listing sorted by creation date
applicationSchema.index({ ownerId: 1, createdAt: -1 });

// Partial or compound unique index: a user cannot register the exact same URL twice
applicationSchema.index({ ownerId: 1, url: 1 }, { unique: true });

export const Application = mongoose.model('Application', applicationSchema);

