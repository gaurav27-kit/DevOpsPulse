import mongoose from 'mongoose';

const sloSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'SLO must belong to an account owner'],
      index: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: [true, 'SLO must reference an application'],
      unique: true // Exactly one SLO per application in MVP
    },
    name: {
      type: String,
      required: [true, 'SLO name is required'],
      trim: true,
      minlength: [1, 'Name must be at least 1 character'],
      maxlength: [60, 'Name cannot exceed 60 characters']
    },
    targetPercent: {
      type: Number,
      required: [true, 'Target percentage is required'],
      min: [90.0, 'Target percent must be at least 90%'],
      max: [99.999, 'Target percent cannot exceed 99.999%']
    },
    windowDays: {
      type: Number,
      required: [true, 'Window days is required'],
      enum: {
        values: [7, 30],
        message: 'Window days must be either 7 or 30'
      }
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

// Compound index for user listing and chronological sorting
sloSchema.index({ ownerId: 1, createdAt: -1 });

export const Slo = mongoose.model('Slo', sloSchema);

