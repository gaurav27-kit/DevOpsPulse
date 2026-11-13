import mongoose from 'mongoose';

/**
 * ContactMessage Model
 *
 * Stores user-submitted inquiries from the public landing page.
 * TTL index of 180 days automatically purges stale contact messages.
 */
const contactMessageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: ['new', 'read'],
      default: 'new'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: { expires: 180 * 24 * 60 * 60 } // 180 days TTL
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
