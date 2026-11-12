import mongoose from 'mongoose';

const sloAlertStateSchema = new mongoose.Schema(
  {
    sloId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Slo',
      required: true,
      unique: true,
      index: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['healthy', 'at_risk', 'breached', 'insufficient_data'],
      default: 'insufficient_data'
    },
    pendingStatus: {
      type: String,
      enum: ['healthy', 'at_risk', 'breached', 'insufficient_data', null],
      default: null
    },
    pendingCount: {
      type: Number,
      default: 0
    },
    pendingSince: {
      type: Date,
      default: null
    },
    episode: {
      type: Number,
      default: 0
    },
    burnLevel: {
      type: String,
      enum: ['none', 'high', 'critical'],
      default: 'none'
    },
    dataState: {
      type: String,
      enum: ['ok', 'insufficient', 'stale'],
      default: 'ok'
    },
    lastEvaluatedAt: {
      type: Date,
      default: null
    },
    version: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const SloAlertState = mongoose.model('SloAlertState', sloAlertStateSchema);

