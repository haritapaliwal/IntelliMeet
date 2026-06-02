import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/error';
import ActionItem from '../models/ActionItem';
import { sendSuccess } from '../utils/response';
import { notificationService } from '../services/notification.service';
import { schedulerService } from '../services/scheduler.service';
import logger from '../utils/logger';

// Zod schemas
const CreateActionItemSchema = z.object({
  meetingId: z.string().min(1, 'Meeting ID is required'),
  task: z.string().min(1, 'Task description is required'),
  assignee: z.string().min(1, 'Assignee is required'),
  dueDate: z.string().datetime({ message: 'Invalid due date format (must be ISO-8601)' }),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED'], {
    errorMap: () => ({ message: "Status must be either 'PENDING', 'IN_PROGRESS', or 'COMPLETED'" }),
  }),
});

/**
 * Manually Create Action Item
 * POST /api/action-items
 */
export const createActionItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const parsedData = CreateActionItemSchema.parse(req.body);

    const actionItem = await ActionItem.create({
      meetingId: parsedData.meetingId,
      userId: req.user.id,
      task: parsedData.task,
      assignee: parsedData.assignee,
      status: 'PENDING',
      dueDate: new Date(parsedData.dueDate),
      citations: [],
      notified: false,
    });

    return sendSuccess(res, actionItem, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update Action Item Status
 * PATCH /api/action-items/:id/status
 */
export const updateStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const { id } = req.params;
    const parsedData = UpdateStatusSchema.parse(req.body);

    const actionItem = await ActionItem.findOne({
      _id: id,
      userId: req.user.id,
    });

    if (!actionItem) {
      throw new AppError('Action item not found', 'ACTION_ITEM_NOT_FOUND', 404);
    }

    actionItem.status = parsedData.status;
    
    // If set to completed, reset notified flag so if it's reopened it can be sent again
    if (parsedData.status === 'COMPLETED') {
      actionItem.notified = true; // Completed items do not need overdue notifications
    } else {
      // Re-opened: check if it's already overdue and decide if it needs notifications later
      actionItem.notified = false;
    }

    await actionItem.save();

    return sendSuccess(res, actionItem);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Action Items (with optional filtering)
 * GET /api/action-items
 */
export const getActionItems = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const { status, assignee, meetingId } = req.query;

    const query: any = { userId: req.user.id };

    if (status) {
      query.status = status;
    }
    if (assignee) {
      query.assignee = assignee;
    }
    if (meetingId) {
      query.meetingId = meetingId;
    }

    // Populate the meeting details so we can show meeting titles on the dashboard
    const actionItems = await ActionItem.find(query)
      .populate('meetingId', 'title')
      .sort({ dueDate: 1 });

    return sendSuccess(res, actionItems);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Overdue Action Items
 * GET /api/action-items/overdue
 */
export const getOverdueActionItems = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    const now = new Date();

    const overdueItems = await ActionItem.find({
      userId: req.user.id,
      status: { $ne: 'COMPLETED' },
      dueDate: { $lt: now },
    }).populate('meetingId', 'title').sort({ dueDate: 1 });

    return sendSuccess(res, overdueItems);
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger Reminders Manually (Helper route for quick evaluation and testing!)
 * POST /api/action-items/trigger-reminders
 */
export const triggerReminders = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }

    logger.info('Manual trigger request received for overdue scheduler check.', {
      traceId: res.locals.traceId,
    });

    // Run the scheduler scan and capture details
    const result = await schedulerService.scanAndNotify(res.locals.traceId);

    return sendSuccess(res, {
      message: 'Scheduler reminder job executed successfully.',
      processedCount: result.processedCount,
      successCount: result.successCount,
      failedCount: result.failedCount,
      logs: result.logs,
    });
  } catch (error) {
    next(error);
  }
};
