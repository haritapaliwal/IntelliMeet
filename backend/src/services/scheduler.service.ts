import cron from 'node-cron';
import logger from '../utils/logger';
import ActionItem from '../models/ActionItem';
import ReminderHistory from '../models/ReminderHistory';
import { notificationService } from './notification.service';
import { v4 as uuidv4 } from 'uuid';

class SchedulerService {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Initializes the node-cron scheduler to run periodic checks.
   */
  public initialize(cronExpression = '*/5 * * * *'): void {
    // Run background scan on start, then set recurring cron
    logger.info(`Initializing background scheduler job with schedule expression: "${cronExpression}"`);
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      const traceId = `cron-${uuidv4().substring(0, 8)}`;
      logger.info('Scheduled cron execution triggered for overdue action items check.', { traceId });
      
      try {
        const result = await this.scanAndNotify(traceId);
        logger.info(`Cron check completed. Processed: ${result.processedCount}, Notified: ${result.successCount}, Failed: ${result.failedCount}`, { traceId });
      } catch (err: any) {
        logger.error(`Error encountered inside scheduled cron job run: ${err.message}`, { traceId });
      }
    });
  }

  /**
   * Core execution method: Scans database and dispatches reminders.
   */
  public async scanAndNotify(traceId: string): Promise<{
    processedCount: number;
    successCount: number;
    failedCount: number;
    logs: string[];
  }> {
    const now = new Date();
    const logs: string[] = [];

    // 1. Fetch action items that are overdue and haven't been successfully notified
    const overdueItems = await ActionItem.find({
      status: { $ne: 'COMPLETED' },
      dueDate: { $lt: now },
      notified: false,
    }).populate('meetingId', 'title');

    logs.push(`Found ${overdueItems.length} un-notified overdue action items.`);
    logger.info(`Found ${overdueItems.length} overdue action items requiring background notification.`, { traceId });

    let successCount = 0;
    let failedCount = 0;

    // 2. Loop through and dispatch webhooks
    for (const item of overdueItems) {
      const meetingTitle = (item.meetingId as any)?.title || 'Unknown Meeting';
      
      logs.push(`Processing item "${item.task}" assigned to ${item.assignee}...`);

      const res = await notificationService.sendOverdueReminder(
        {
          task: item.task,
          assignee: item.assignee,
          dueDate: item.dueDate,
          meetingTitle,
        },
        traceId
      );

      // 3. Log Reminder History in Database
      try {
        await ReminderHistory.create({
          actionItemId: item._id,
          status: res.success ? 'SUCCESS' : 'FAILED',
          channel: process.env.DISCORD_WEBHOOK_URL ? 'Discord Webhook' : process.env.SLACK_WEBHOOK_URL ? 'Slack Webhook' : 'Unconfigured Webhook',
          details: res.success ? 'Delivered successfully.' : res.details || 'Delivery failed.',
        });
      } catch (logErr: any) {
        logger.error(`Failed to write reminder history entry: ${logErr.message}`, { traceId });
      }

      // 4. Update the ActionItem document
      if (res.success) {
        item.notified = true;
        await item.save();
        successCount++;
        logs.push(`Item "${item.task}" notified successfully.`);
      } else {
        // If failed, keep notified: false so it retries, but we increment failed count
        failedCount++;
        logs.push(`Item "${item.task}" notification failed: ${res.details}`);
      }
    }

    return {
      processedCount: overdueItems.length,
      successCount,
      failedCount,
      logs,
    };
  }

  /**
   * Stop background cron job execution (for graceful shutdown)
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Scheduler cron job stopped.');
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
