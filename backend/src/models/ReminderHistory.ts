import { Schema, model, Document, Types } from 'mongoose';

export interface IReminderHistory extends Document {
  actionItemId: Types.ObjectId;
  sentAt: Date;
  status: 'SUCCESS' | 'FAILED';
  channel: string;
  details?: string;
}

const ReminderHistorySchema = new Schema<IReminderHistory>(
  {
    actionItemId: {
      type: Schema.Types.ObjectId,
      ref: 'ActionItem',
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED'],
      required: true,
    },
    channel: {
      type: String,
      required: true,
    },
    details: {
      type: String,
    },
  },
  {
    timestamps: false, // timestamps not needed since sentAt represents the exact entry time
  }
);

// Indexes
ReminderHistorySchema.index({ actionItemId: 1 });
ReminderHistorySchema.index({ sentAt: -1 });

export const ReminderHistory = model<IReminderHistory>('ReminderHistory', ReminderHistorySchema);
export default ReminderHistory;
