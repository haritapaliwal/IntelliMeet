import { Schema, model, Document, Types } from 'mongoose';

export interface ITranscriptSegment {
  timestamp: string;
  speaker: string;
  text: string;
}

export interface ICitation {
  timestamp: string;
}

export interface IAiContent {
  text: string;
  citations: ICitation[];
}

export interface IAiAnalysis {
  summary: IAiContent[];
  decisions: IAiContent[];
  followUps: IAiContent[];
  generatedAt?: Date;
}

export interface IMeeting extends Document {
  userId: Types.ObjectId;
  title: string;
  meetingDate: Date;
  participants: string[];
  transcript: ITranscriptSegment[];
  aiAnalysis?: IAiAnalysis;
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptSegmentSchema = new Schema<ITranscriptSegment>({
  timestamp: { type: String, required: true },
  speaker: { type: String, required: true },
  text: { type: String, required: true },
}, { _id: false });

const CitationSchema = new Schema<ICitation>({
  timestamp: { type: String, required: true },
}, { _id: false });

const AiContentSchema = new Schema<IAiContent>({
  text: { type: String, required: true },
  citations: [CitationSchema],
}, { _id: false });

const AiAnalysisSchema = new Schema<IAiAnalysis>({
  summary: [AiContentSchema],
  decisions: [AiContentSchema],
  followUps: [AiContentSchema],
  generatedAt: { type: Date, default: Date.now },
}, { _id: false });

const MeetingSchema = new Schema<IMeeting>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Meeting title is required'],
      trim: true,
    },
    meetingDate: {
      type: Date,
      required: [true, 'Meeting date is required'],
    },
    participants: {
      type: [String],
      default: [],
    },
    transcript: {
      type: [TranscriptSegmentSchema],
      required: [true, 'Meeting transcript is required'],
      validate: {
        validator: function (v: ITranscriptSegment[]) {
          return v.length > 0;
        },
        message: 'Meeting transcript must have at least one segment.',
      },
    },
    aiAnalysis: {
      type: AiAnalysisSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster lookups
MeetingSchema.index({ userId: 1 });
MeetingSchema.index({ meetingDate: -1 });

export const Meeting = model<IMeeting>('Meeting', MeetingSchema);
export default Meeting;
