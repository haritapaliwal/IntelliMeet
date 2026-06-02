import logger from '../utils/logger';

export interface INotificationPayload {
  task: string;
  assignee: string;
  dueDate: Date;
  meetingTitle: string;
}

class NotificationService {
  /**
   * Dispatches an overdue action item reminder to Discord/Slack webhooks.
   */
  public async sendOverdueReminder(
    payload: INotificationPayload,
    traceId: string
  ): Promise<{ success: boolean; details?: string }> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      const msg = 'No Discord or Slack Webhook URL defined in environment variables. Webhook notification skipped.';
      logger.warn(msg, { traceId });
      return { success: false, details: msg };
    }

    try {
      // 1. Check if it's a Slack or Discord webhook to format payload correctly
      const isSlack = webhookUrl.includes('slack.com');

      let body: any;

      if (isSlack) {
        // Format for Slack Block Kit
        body = {
          text: `🚨 *Overdue Action Item Reminder*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚨 *Overdue Action Item Reminder* \n*Meeting:* _${payload.meetingTitle}_\n*Task:* \`${payload.task}\`\n*Assigned To:* *_${payload.assignee}_*\n*Due Date:* \`${payload.dueDate.toLocaleDateString()} ${payload.dueDate.toLocaleTimeString()}\``,
              },
            },
          ],
        };
      } else {
        // Format for Discord Rich Embeds
        body = {
          username: 'IntelliMeet Assistant',
          avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80',
          embeds: [
            {
              title: '🚨 Overdue Action Item Alert',
              description: `An action item from meeting **"${payload.meetingTitle}"** is currently overdue!`,
              color: 15158332, // Red color hex
              fields: [
                {
                  name: '📋 Task Description',
                  value: `\`${payload.task}\``,
                  inline: false,
                },
                {
                  name: '👤 Assigned To',
                  value: `**${payload.assignee}**`,
                  inline: true,
                },
                {
                  name: '📅 Due Date',
                  value: `\`${payload.dueDate.toLocaleDateString()} ${payload.dueDate.toLocaleTimeString()}\``,
                  inline: true,
                },
              ],
              footer: {
                text: 'IntelliMeet Background Reminder Service',
              },
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }

      // 2. Dispatch fetch HTTP Request
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Webhook endpoint returned status ${response.status}: ${errorText}`);
      }

      logger.info('Overdue action item reminder sent successfully to third-party webhook.', { traceId });
      return { success: true };
    } catch (error: any) {
      const errorMsg = `Failed to deliver notification to webhook: ${error.message}`;
      logger.error(errorMsg, { traceId });
      return { success: false, details: error.message };
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
