import mongoose from 'mongoose';

/**
 * MaintenanceWindow Schema
 * Tracks scheduled, active, completed, and cancelled maintenance windows for monitored applications.
 */
const maintenanceWindowSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: [true, 'Maintenance window must reference an application'],
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Maintenance window must reference an owner'],
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Maintenance window must record who created it']
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reason: {
      type: String,
      required: [true, 'Maintenance reason is required'],
      trim: true,
      minlength: [1, 'Reason cannot be empty'],
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    startAt: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true
    },
    endAt: {
      type: Date,
      required: [true, 'End time is required'],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
        message: '{VALUE} is not a valid maintenance status'
      },
      default: 'SCHEDULED',
      index: true
    },
    endedAt: {
      type: Date,
      default: null
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

// Compound indexes for performant querying and background scheduler polling
maintenanceWindowSchema.index({ applicationId: 1, status: 1 });
maintenanceWindowSchema.index({ applicationId: 1, startAt: -1 });
maintenanceWindowSchema.index({ status: 1, startAt: 1 });
maintenanceWindowSchema.index({ status: 1, endAt: 1 });

export const MaintenanceWindow = mongoose.model('MaintenanceWindow', maintenanceWindowSchema);

