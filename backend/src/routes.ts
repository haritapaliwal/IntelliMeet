import { Router, Request, Response } from 'express';
import { register, login, getMe } from './controllers/auth.controller';
import { createMeeting, getMeetingById, listMeetings, analyzeMeeting } from './controllers/meeting.controller';
import { createActionItem, updateStatus, getActionItems, getOverdueActionItems, triggerReminders } from './controllers/action-item.controller';
import authMiddleware from './middleware/auth';
import { sendSuccess } from './utils/response';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Health Check Endpoint
router.get('/health', (req: Request, res: Response) => {
  return res.status(200).json({ status: 'UP' });
});

// Candidate Evaluation Endpoint
router.get('/api/evaluation', (req: Request, res: Response) => {
  const data = {
    candidateName: process.env.CANDIDATE_NAME || 'Full Stack Intern Candidate',
    email: process.env.CANDIDATE_EMAIL || 'candidate@example.com',
    repositoryUrl: process.env.REPOSITORY_URL || 'https://github.com/candidate/intellimeet',
    deployedUrl: process.env.DEPLOYED_URL || 'https://intellimeet-app.render.com',
    externalIntegration: process.env.DISCORD_WEBHOOK_URL ? 'Discord Webhook' : process.env.SLACK_WEBHOOK_URL ? 'Slack Webhook' : 'Discord/Slack Webhook API',
    features: [
      'Authentication',
      'AI Analysis',
      'Reminder Scheduler'
    ]
  };
  return res.status(200).json(data);
});

// Auth Routes (Public)
router.post('/api/auth/register', register);
router.post('/api/auth/login', login);

// ==========================================
// PROTECTED ROUTES (Requires JWT)
// ==========================================

// Auth Details (Me)
router.get('/api/auth/me', authMiddleware as any, getMe as any);

// Meeting Management Routes
router.post('/api/meetings', authMiddleware as any, createMeeting as any);
router.get('/api/meetings', authMiddleware as any, listMeetings as any);
router.get('/api/meetings/:id', authMiddleware as any, getMeetingById as any);

// AI Meeting Analysis Route
router.post('/api/meetings/:id/analyze', authMiddleware as any, analyzeMeeting as any);

// Action Item Management Routes
router.post('/api/action-items', authMiddleware as any, createActionItem as any);
router.get('/api/action-items', authMiddleware as any, getActionItems as any);
router.get('/api/action-items/overdue', authMiddleware as any, getOverdueActionItems as any);
router.patch('/api/action-items/:id/status', authMiddleware as any, updateStatus as any);

// Scheduled Reminder Job Trigger Route (For manual review and rapid evaluation testing!)
router.post('/api/action-items/trigger-reminders', authMiddleware as any, triggerReminders as any);

export default router;
