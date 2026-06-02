import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/error';
import Meeting from '../models/Meeting';
import ActionItem from '../models/ActionItem';
import aiService from '../services/ai.service';
import { sendSuccess } from '../utils/response';

// Zod validation schemas
const TranscriptSegmentSchema = z.object({
  timestamp: z.string().min(1, 'Transcript segment must contain a timestamp'),
  speaker: z.string().min(1, 'Transcript segment must contain a speaker name'),
  text: z.string().min(1, 'Transcript segment must contain text content'),
});

const CreateMeetingSchema = z.object({
  title: z.string().min(1, 'Meeting title is required').max(150, 'Title is too long'),
  participants: z.array(z.string().email('Invalid email in participant list')).default([]),
  meetingDate: z.string().datetime({ message: 'Invalid meeting date format (must be ISO-8601)' }),
  transcript: z.array(TranscriptSegmentSchema).min(1, 'Transcript must contain at least one segment'),
});

/**
 * Create Meeting
 * POST /api/meetings
 */
export const createMeeting = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const parsedData = CreateMeetingSchema.parse(req.body);

    const newMeeting = await Meeting.create({
      userId: req.user.id,
      title: parsedData.title,
      meetingDate: new Date(parsedData.meetingDate),
      participants: parsedData.participants,
      transcript: parsedData.transcript,
    });

    return sendSuccess(res, newMeeting, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Meeting by ID
 * GET /api/meetings/:id
 */
export const getMeetingById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const meetingId = req.params.id;

    const meeting = await Meeting.findOne({
      _id: meetingId,
      userId: req.user.id,
    });

    if (!meeting) {
      throw new AppError('Meeting not found', 'MEETING_NOT_FOUND', 404);
    }

    return sendSuccess(res, meeting);
  } catch (error) {
    next(error);
  }
};

/**
 * List Meetings (with pagination & search)
 * GET /api/meetings
 */
export const listMeetings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    const skip = (page - 1) * limit;

    const query: any = { userId: req.user.id };
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .sort({ meetingDate: -1 })
        .skip(skip)
        .limit(limit),
      Meeting.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return sendSuccess(res, {
      meetings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * AI Analyze Meeting
 * POST /api/meetings/:id/analyze
 */
export const analyzeMeeting = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const meetingId = req.params.id;
    const traceId = res.locals.traceId || 'unknown';

    // 1. Fetch meeting
    const meeting = await Meeting.findOne({
      _id: meetingId,
      userId: req.user.id,
    });

    if (!meeting) {
      throw new AppError('Meeting not found', 'MEETING_NOT_FOUND', 404);
    }

    // 2. Call AI Service to parse and grounded-summarize transcript
    const aiResult = await aiService.analyzeTranscript(
      meeting.title,
      meeting.transcript,
      traceId
    );

    // 3. Save AI results back into the Meeting document
    meeting.aiAnalysis = {
      summary: aiResult.summary,
      decisions: aiResult.decisions,
      followUps: aiResult.followUps,
      generatedAt: new Date(),
    };
    await meeting.save();

    // 4. Clean up any previously extracted action items for this meeting to avoid duplicates if re-analyzed
    await ActionItem.deleteMany({ meetingId: meeting._id });

    // 5. Insert new action items into the ActionItem Collection
    const actionItemsToInsert = (aiResult.actionItems || []).map((item) => {
      // Establish default due date: 7 days from the meeting date
      const dueDate = new Date(meeting.meetingDate);
      dueDate.setDate(dueDate.getDate() + 7);

      return {
        meetingId: meeting._id,
        userId: req.user!.id,
        task: item.task,
        assignee: item.assignee,
        status: 'PENDING',
        dueDate,
        citations: item.citations,
        notified: false,
      };
    });

    let insertedActionItems: any[] = [];
    if (actionItemsToInsert.length > 0) {
      insertedActionItems = await ActionItem.insertMany(actionItemsToInsert);
    }

    // 6. Return response
    return sendSuccess(res, {
      meeting,
      actionItems: insertedActionItems,
    });
  } catch (error) {
    next(error);
  }
};
