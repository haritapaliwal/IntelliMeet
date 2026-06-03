# Changelog (CHANGELOG.md)

All notable changes and milestones completed in the development of the Hintro Meeting Intelligence Service.

---

## [Phase 2] - Day 2 Milestones (Completed & Pushed)

### Added
- **AI Analysis Service** (`ai.service.ts`): Dual AI engine utilizing Google Gemini and Groq API.
  - Automatic fallback mechanism: shifts to Groq if Gemini token is missing or encounters rate-limiting.
  - Grounding validation pass: parses and compares citations, scrubbing out any timestamps not present in the transcript.
  - Local pattern-matching heuristic fallback: runs offline if no credentials are configured.
- **Meeting AI Analysis Endpoint** (`POST /api/meetings/:id/analyze`): Connects to the AI service, updates the Meeting model, deletes stale tasks, and registers new action items.
- **Background Cron Scheduler** (`scheduler.service.ts`): Powered by `node-cron` to automatically check for overdue items.
- **Webhook Integration** (`notification.service.ts`): Delivers rich embeds describing overdue task descriptions, assignees, and due dates to Discord/Slack.
- **Manual Trigger Route** (`POST /api/action-items/trigger-reminders`): Allows reviewers to verify webhook deliveries instantly.
- **Interactive Swagger Documentation**: Exposed at `/api-docs` using the custom schema definition.

---

## [Phase 1] - Day 1 Milestones (Completed & Pushed)

### Added
- **Core Server Scaffolding**: Structured Express & TypeScript project under `./backend` with linting, formatting, and strict builds.
- **Mongoose Database Integration**: Linked mongoose configuration with automatic schema indices mapping User, Meeting, ActionItem, and ReminderHistory collections.
- **Stateless JWT Security**: Built registration and login handlers with `bcryptjs` password encryption and signed JWT payload validation.
- **Traceability System**: Custom middleware allocating unique UUID traceIds on all request lifecycles.
- **Structured Winston Logger**: Emits log entries including timestamp, method, request path, trace ID, and status code.
- **Central Error Catcher**: Formats operational, database, parser, and Zod validator failures into unified API responses.
