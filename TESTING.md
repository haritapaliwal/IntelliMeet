# Testing Scenarios & Validation (TESTING.md)

This document details the test scenarios executed, edge cases handled, and limitations discovered during verification of the backend.

---

## 1. Test Scenarios Executed

### Scenario A: Authentication & Route Protection
1. **Invalid Registration**: Sent a registration request with an invalid email address format and a password under 6 characters. Verify that Zod triggers a 400 Bad Request with a detailed validation payload.
2. **Double Registration**: Registered `user1@example.com`, then attempted to register the same email again. Verified that database triggers a 400 Bad Request with `EMAIL_ALREADY_EXISTS`.
3. **Route Guard verification**: Attempted to query `GET /api/meetings` without an Authorization header. Verified that server returns `401 Unauthorized`.
4. **JWT Lifespan Validation**: Expired the token artificially and verified that the route guard catches `TOKEN_EXPIRED` and denies request.

### Scenario B: Meeting Insertion & Pagination
1. **Meeting Creation validation**: Submitted a meeting with no transcript segments. Verified that Zod throws a validation error.
2. **Search & Pagination**: Inserted 15 mock meetings. Requested `GET /api/meetings?page=2&limit=5`. Verified that:
   - Exactly 5 meetings are returned.
   - Response metadata contains pagination details (`total: 15`, `totalPages: 3`, `hasNextPage: true`, `hasPrevPage: true`).
   - Adding parameter `search=Sprint` correctly filters titles matching that case-insensitive query.

### Scenario C: AI Analysis & Automatic Fallback
1. **Gemini Primary Execution**: Verified that with a valid `GEMINI_API_KEY`, the server parses transcripts, returns structured summaries/action items, and matches citations.
2. **Groq Fallback Execution**: Removed the `GEMINI_API_KEY` from `.env`, keeping `GROQ_API_KEY` active. Triggered analysis. Verified from Winston log output that the server catches the warning, switches to Groq, and completes the analysis.
3. **Heuristic Failure Recovery**: Removed all API keys. Verified that the server falls back to local regex extraction and completes request with a HTTP 200.

### Scenario D: Webhook Notifications & Scheduler
1. **Overdue Extraction**: Created a task with `dueDate` in the past. Verified that calling `GET /api/action-items/overdue` returns it.
2. **Manual Webhook Dispatch**: Triggered `POST /api/action-items/trigger-reminders`. Verified that a formatted rich embed message is delivered to the Discord server channel.
3. **History Logging**: Checked the database for `ReminderHistory`. Verified that the webhook delivery attempt is recorded, and the action item's `notified` status is set to `true`.

---

## 2. Edge Cases Handled

- **Token Expiry & Malformed JWTs**: JWT decoding is wrapped in try-catch guards to separate expired tokens from invalid/tempered tokens, returning unique error codes (`TOKEN_EXPIRED` vs `UNAUTHORIZED`).
- **No Assignee in Transcript**: If the transcript describes a task without allocating it, the AI service defaults the assignee field to `"Unassigned"` instead of throwing schema errors.
- **AI Hallucinated Citations**: If the LLM generates a citation segment that does not exist in the provided transcript, the citation filter removes it.

---

## 3. Limitations Discovered

- **Cron Firing Precision**: In local development, the cron job is set to check every minute (`* * * * *`). In a production server, this should be set to run once every hour or day to prevent rate-limiting on third-party webhook gateways.
- **Single Channel Webhook**: The current system dispatches all reminders to a single global Discord/Slack URL. In a multi-tenant enterprise system, each user or team would register their own webhook coordinates.
