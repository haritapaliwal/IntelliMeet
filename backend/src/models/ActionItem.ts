import { Schema, model, Document, Types } from 'mongoose';

export type ActionItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface IActionItem extends Document {
  meetingId: Types.ObjectId;
  userId: Types.ObjectId; // User who owns this meeting
  task: string;
  assignee: string; // Name or email of the person assigned
  status: ActionItemStatus;
  dueDate: Date;
  citations: { timestamp: string }[];
  notified: boolean; // Tracks if overdue webhook notification has been sent
  createdAt: Date;
  updatedAt: Date;
}

const ActionItemSchema = new Schema<IActionItem>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    task: {
      type: String,
      required: [true, 'Task description is required'],
      trim: true,
    },
    assignee: {
      type: String,
      required: [true, 'Assignee name or email is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
      default: 'PENDING',
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    citations: {
      type: [{ timestamp: { type: String, required: true } }],
      default: [],
    },
    notified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ActionItemSchema.index({ userId: 1 });
ActionItemSchema.index({ meetingId: 1 });
ActionItemSchema.index({ status: 1, dueDate: 1 });

export const ActionItem = model<IActionItem>('ActionItem', ActionItemSchema);
export default ActionItem;
