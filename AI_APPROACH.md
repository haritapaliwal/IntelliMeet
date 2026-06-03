# AI Integration & Grounding Strategy (AI_APPROACH.md)

This document explains our approach to prompt engineering, dual-engine failover, citation mapping, and preventing LLM hallucinations inside the Hintro Meeting Intelligence Service.

---

## 1. Prompt Design & Structured JSON Output

To ensure that the API returns a structured, predictable format, we design a single master prompt containing:
1. **Context Bindings**: Meeting title and serialised transcript dialogue.
2. **Behavioral System Constraints**: Rules preventing the model from inserting names, tasks, or decisions that are not explicitly present.
3. **Strict Schema Specifier**: Standard JSON schema showing exactly what arrays and fields are expected.

We use **Structured Outputs** (via Gemini's `responseMimeType: 'application/json'` and Groq's `type: 'json_object'`). This forces the underlying model to return a valid JSON payload that parses directly into our TypeScript interfaces.

---

## 2. Citation Strategy

A key requirement is that all summaries, decisions, follow-ups, and action items must link back to the transcript.
- **Dialogue Offsets**: The transcript is pre-processed as a list of segments, each having a unique string `timestamp` (e.g. `"00:10"`).
- **Embedded Citations**: The prompt demands that for every insight generated, the model must output a `"citations"` array pointing to the exact transcript timestamps where the statement was made.
- **Interactive UI Highlighting**: The frontend maps these timestamps. Clicking an insight's citation scrolls the transcript view and highlights the specific speaker segment.

---

## 3. Hallucination Prevention & Validation

LLMs can generate plausible-looking timestamps that do not exist in the source transcript. To eliminate this issue, our [ai.service.ts](file:///d:/projects/IntelliMeet/backend/src/services/ai.service.ts) runs a **post-generation validation pass**:

1. **Source Registry**: Extract all valid timestamps from the input transcript into a quick-lookup set.
2. **Citation Scrubbing**: Scan every generated insight's citation list. Any timestamp that is *not* found in the lookup set is logged as a warning and immediately stripped from the output.
3. **Safety Fallback**: If an insight is returned with zero valid citations, we default it to the timestamp of the very first segment in the transcript to preserve grounding alignment.

---

## 4. Dual-Engine Failover Chain

Because LLM API endpoints can experience rate limits, quota issues, or connection dropouts:
- **Primary Engine**: Google Gemini API (`gemini-1.5-flash`). Chosen for its high speed, generous API limits, and structured JSON output guarantees.
- **Secondary Fallback**: Groq API (`llama-3.1-70b-versatile`). Activated automatically if `GEMINI_API_KEY` is missing or fails.
- **Offline Mock Heuristic**: If both keys are absent or fail, the service triggers a local pattern-matching regex parser. This scans the transcript for action verbs ("should", "will", "agree") and generates mock insights, preventing the application from crashing.

---

## 5. Known Limitations

- **Long Transcripts**: For extremely long meetings (e.g., > 2 hours), the transcript may exceed the context window or result in higher API costs. A chunking and map-reduce aggregation technique would be required for production-scale volumes.
- **Overlapping Timestamps**: If multiple conversations happen at the same timestamp, the citation links to the entire timestamp block rather than a specific sentence offset.
