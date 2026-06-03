# Hintro Meeting Intelligence Service (README.md)

An AI-powered Meeting Intelligence Service designed to store meeting transcripts, extract grounded insights (summaries, decisions, follow-ups) with precise timestamp citations, manage action items, detect overdue tasks, and trigger automated Slack/Discord reminders.

This application is built with a **TypeScript/Express/MongoDB (Mongoose)** backend and an upcoming premium glassmorphic **Vite/React** frontend.

---

## ⚡ Key Technical Features
1. **Dual AI Engine Fallback**: Integrates Google Gemini API (`gemini-1.5-flash`) as the primary analyzer, falling back to the Groq API (`llama-3.1-70b-versatile`) if credentials are absent or rate-limited. Offline heuristic extraction activates if both keys are unconfigured.
2. **Hallucination Prevention**: Runs a validation pass checking that every generated citation matches a real dialogue timestamp in the source transcript, scrubbing invalid references instantly.
3. **Stateless Security**: Enforces standard JWT Authorization headers for protected APIs.
4. **End-to-End Traceability**: Injects a unique `X-Trace-ID` UUID on all requests, logging them alongside Winston request logs for rapid troubleshooting.
5. **Scheduled Notifications**: Background cron schedules query overdue items and dispatch rich embeds to Discord/Slack.

---

## 🛠️ Local Installation & Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or higher (we recommend `v24.x`).
- **MongoDB**: A running local MongoDB community edition daemon (`mongodb://localhost:27017`) or an active MongoDB Atlas cluster URI.

### 2. Installation Steps
Clone or open the project folder, then navigate into the backend directory and install dependencies:
```bash
cd backend
npm install
```

### 3. Environment Configuration
Copy the environment variables template file to create an active configuration:
```bash
cp .env.example .env
```
Open `.env` and fill in the required keys:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/intellimeet

JWT_SECRET=supersecret_intellimeet_jwt_key
JWT_EXPIRES_IN=24h

# Google Gemini API key (Get one from https://aistudio.google.com/)
GEMINI_API_KEY=your_gemini_api_key_here

# Groq API key (Get one from https://console.groq.com/)
GROQ_API_KEY=your_groq_api_key_here

# Reminders webhook integration (Discord/Slack Webhook URL)
DISCORD_WEBHOOK_URL=your_discord_webhook_url_here

# Scheduler configuration (Runs every minute by default)
CRON_SCHEDULE=* * * * *
```

### 4. Running the Server
Compile the TypeScript code and start the development server with live reload:
```bash
npm run dev
```
You should see:
```text
===========================================================
   IntelliMeet Meeting Intelligence Service is now online!
   Server Port:   5000
   Environment:   development
   API Playground: http://localhost:5000/api-docs
===========================================================
```
Open a browser to `http://localhost:5000/api-docs` to interact with our OpenAPI Swagger playground.

---

## 📡 API Usage Examples

### 1. Register Account
`POST /api/auth/register`
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Cooper",
    "email": "alice@example.com",
    "password": "securepassword123"
  }'
```
*Response Header:* `X-Trace-ID: 7e735e5d-16be-4c22-b9cf-bd1cc8e9f50e`  
*Response Body:*
```json
{
  "traceId": "7e735e5d-16be-4c22-b9cf-bd1cc8e9f50e",
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "647b1e7b8...",
      "email": "alice@example.com",
      "name": "Alice Cooper"
    }
  }
}
```

### 2. Login Account
`POST /api/auth/login`
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "securepassword123"
  }'
```

### 3. Create Meeting (Protected - Requires JWT)
`POST /api/meetings`
```bash
curl -X POST http://localhost:5000/api/meetings \
  -H "Authorization: Bearer <your_jwt_token_here>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sprint Planning Sync",
    "meetingDate": "2026-06-03T10:00:00Z",
    "participants": ["alice@example.com", "bob@example.com"],
    "transcript": [
      { "timestamp": "00:10", "speaker": "John", "text": "We must deploy the login page this Friday." },
      { "timestamp": "00:20", "speaker": "Alice", "text": "Understood. I will prepare release notes and update the staging branch." }
    ]
  }'
```

### 4. Trigger AI Meeting Analysis (Protected)
`POST /api/meetings/:id/analyze`
```bash
curl -X POST http://localhost:5000/api/meetings/<meeting_id>/analyze \
  -H "Authorization: Bearer <your_jwt_token_here>"
```
*Expected Actions:*
- Fetches transcript, sends to Gemini (or fallback Groq).
- Populates `aiAnalysis` nested values in Meeting collection.
- Automatically creates task cards in ActionItem collection with 7-day deadlines, assigning tasks to speakers based on context.

### 5. Get Action Items (Protected)
`GET /api/action-items`
```bash
curl -X GET http://localhost:5000/api/action-items \
  -H "Authorization: Bearer <your_jwt_token_here>"
```
*Supports query string filters:* `?status=PENDING&assignee=Alice&meetingId=...`

### 6. Manually Trigger Reminders check (Protected)
`POST /api/action-items/trigger-reminders`
- Instantly runs background scanning to dispatch Discord notifications for any incomplete tasks with due dates in the past, logging runs in the `ReminderHistory` table.
