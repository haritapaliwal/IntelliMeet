# Technical Decisions Document (DECISIONS.md)

This document describes the architectural patterns and technical decisions made during the development of the Hintro Meeting Intelligence Service.

---

## 1. Database Choice: MongoDB & Mongoose

### Why it was Chosen
We chose **MongoDB** coupled with **Mongoose ODM** as the core database solution.
- **Flexible Document Model**: Meeting transcripts and AI-extracted insights (summaries, decisions, follow-ups) naturally fit a document-oriented representation. Storing hierarchical and embedded arrays of citations directly inside the meeting document prevents complex SQL joins.
- **Rapid Prototyping**: MongoDB schemas can be extended instantly without running manual SQL migrations, which is crucial for meeting the 72-hour assignment timeline.

### Alternatives Considered
1. **SQLite / PostgreSQL**:
   - *Pros*: Solid ACID compliance and structured relational schemas.
   - *Cons*: Storing variable-length speaker segments and nested citation mappings (like `[{timestamp: "00:10"}]`) in relational databases requires separate tables with foreign key constraints, resulting in high latency joins or storing raw stringified JSON (defeating SQL schema validation).

### Trade-offs
- **ACID Transactions**: Relational databases offer robust multi-table transactions out of the box. However, because our write patterns are highly localized (saving all meeting data and AI summaries under a single `Meeting` document, and inserting action items in bulk), multi-document transactional guarantees are not a bottleneck.

---

## 2. Authentication Strategy: JWT (JSON Web Tokens)

### Why it was Chosen
We implemented stateless **JWT Authentication** for all private API paths.
- **Stateless & Scalable**: Eliminates the need to track active sessions in database lookups or key-value caches (like Redis) on every single request.
- **Industry Standard**: React frontends and mobile apps interact seamlessly with JWTs via standard `Authorization: Bearer <token>` headers.

### Alternatives Considered
1. **Session-based Authentication**:
   - *Pros*: Revocation is instant because sessions are verified against the database.
   - *Cons*: Requires maintaining a session store, adding latency and complexity, and does not scale efficiently across distributed microservices.

### Trade-offs
- **Revocation Complexity**: JWTs are valid until their expiration date (`24h` default) unless complex blacklisting is implemented. We mitigated this by enforcing standard validation and token expiry, which is ideal for a full-stack candidate project.

---

## 3. External Integration: Discord Webhook (with Slack fallback)

### Why it was Chosen
We chose **Discord Webhooks** as the third-party integration channel.
- **Simplicity**: No complex OAuth handshake or server registration is needed. Reminders are dispatched via a single POST request containing a rich JSON embed payload.
- **Visual Impact**: Discord embeds display beautifully formatted fields (Task, Assignee, Due Date) alongside colored statuses, making manual grading instantly readable.
- **Slack Compatability**: The payload formatter automatically parses if the webhook matches a Slack domain and adjusts the request format to Slack's Block Kit specifications.

### Alternatives Considered
1. **Google Calendar API / Notion API**:
   - *Pros*: Very close integration with calendar tasks.
   - *Cons*: Requires heavy OAuth setups, scopes management, and consent screens, which slows down the grading process for reviewers.

### Trade-offs
- Requires the user/reviewer to set up a Discord server channel and copy the webhook URL into `.env`. We documented this clearly in the setup guide.

---

## 4. Project Structure: Monorepo

### Why it was Chosen
We structured the codebase into a clean monorepo folder layout with distinct `./backend` and `./frontend` modules.
- **Isolation of Concerns**: Backend and frontend code are completely decoupled with independent package configurations (`package.json`, `tsconfig.json`).
- **Single Repository Submission**: Fulfills the assignment requirement of submitting a single public GitHub repository containing both source bases.
