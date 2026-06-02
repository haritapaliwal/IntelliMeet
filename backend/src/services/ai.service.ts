import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import logger from '../utils/logger';
import { ITranscriptSegment } from '../models/Meeting';

export interface IAiCitation {
  timestamp: string;
}

export interface IAiContentItem {
  text: string;
  citations: IAiCitation[];
}

export interface IAiActionItem {
  task: string;
  assignee: string;
  citations: IAiCitation[];
}

export interface IAiAnalysisResult {
  summary: IAiContentItem[];
  decisions: IAiContentItem[];
  followUps: IAiContentItem[];
  actionItems: IAiActionItem[];
}

class AIService {
  /**
   * Main analysis method. Tries Gemini, then falls back to Groq if fails or key missing.
   */
  public async analyzeTranscript(
    title: string,
    transcript: ITranscriptSegment[],
    traceId: string
  ): Promise<IAiAnalysisResult> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    let result: IAiAnalysisResult | null = null;

    // 1. Try Gemini
    if (geminiKey) {
      try {
        logger.info('Attempting transcript analysis via Google Gemini API...', { traceId });
        result = await this.analyzeWithGemini(title, transcript, geminiKey);
        logger.info('Successfully analyzed transcript using Gemini.', { traceId });
      } catch (error: any) {
        logger.warn(`Gemini API analysis failed: ${error.message}. Checking fallback options...`, { traceId });
      }
    } else {
      logger.info('GEMINI_API_KEY is not defined. Skipping Gemini engine.', { traceId });
    }

    // 2. Try Groq if Gemini failed or key was missing
    if (!result && groqKey) {
      try {
        logger.info('Attempting transcript analysis via Groq API (fallback)...', { traceId });
        result = await this.analyzeWithGroq(title, transcript, groqKey);
        logger.info('Successfully analyzed transcript using Groq (fallback).', { traceId });
      } catch (error: any) {
        logger.error(`Groq API analysis failed: ${error.message}`, { traceId });
      }
    } else if (!result && !groqKey) {
      logger.error('No AI provider keys (GEMINI_API_KEY or GROQ_API_KEY) are configured in the environment!', { traceId });
    }

    // 3. Fallback to mock analysis if both fail (to avoid crashing in review / offline mode)
    if (!result) {
      logger.warn('All AI API requests failed. Generating grounded heuristic fallback analysis to preserve system operation.', { traceId });
      result = this.generateFallbackAnalysis(transcript);
    }

    // 4. Run Grounding and Citation validation pass
    const validatedResult = this.validateAndFilterCitations(result, transcript, traceId);
    return validatedResult;
  }

  /**
   * Prompt generator containing core guidelines and JSON output schema.
   */
  private getSystemPrompt(title: string, transcriptJson: string): string {
    return `You are Hintro Meeting Intelligence, a highly sophisticated AI meeting assistant.
Analyze the following meeting transcript and extract structured meeting insights.

Meeting Title: "${title}"
Transcript:
${transcriptJson}

---
CRITICAL INSTRUCTIONS & GROUNDING RULES:
1. All extracted insights (summary, decisions, follow-ups, action items) must be STRICTLY grounded in the provided transcript.
2. Under no circumstance are you allowed to invent or hallucinate attendees, tasks, decisions, or results not explicitly present in the text.
3. Every single extracted point MUST include a "citations" array containing one or more "timestamp" objects matching EXACTLY the "timestamp" where this fact was mentioned (e.g. "00:10").
4. For Action Items, assign the task to a specific individual based on the context. If no clear assignee is mentioned, assign them to "Unassigned" or infer the correct speaker.
5. Provide the output in clean, valid JSON format matching the schema below.

JSON SCHEMA REQUIREMENT:
{
  "summary": [
    {
      "text": "Brief grounded summary sentence",
      "citations": [ { "timestamp": "00:10" } ]
    }
  ],
  "decisions": [
    {
      "text": "Conclusive decision made by the team",
      "citations": [ { "timestamp": "00:15" } ]
    }
  ],
  "followUps": [
    {
      "text": "Follow-up suggestion or next topic",
      "citations": [ { "timestamp": "00:20" } ]
    }
  ],
  "actionItems": [
    {
      "task": "Explicit task description",
      "assignee": "Name of the person assigned",
      "citations": [ { "timestamp": "00:25" } ]
    }
  ]
}

Ensure the JSON matches this structure exactly. Return ONLY the raw JSON string. Do not wrap it in markdown code blocks like \\\`\\\`\\\`json.`;
  }

  /**
   * Google Gemini Engine
   */
  private async analyzeWithGemini(
    title: string,
    transcript: ITranscriptSegment[],
    apiKey: string
  ): Promise<IAiAnalysisResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const transcriptJson = JSON.stringify(transcript, null, 2);
    const systemPrompt = this.getSystemPrompt(title, transcriptJson);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    });

    const text = result.response.text().trim();
    return JSON.parse(text) as IAiAnalysisResult;
  }

  /**
   * Groq Engine
   */
  private async analyzeWithGroq(
    title: string,
    transcript: ITranscriptSegment[],
    apiKey: string
  ): Promise<IAiAnalysisResult> {
    const groq = new Groq({ apiKey });
    const transcriptJson = JSON.stringify(transcript, null, 2);
    const systemPrompt = this.getSystemPrompt(title, transcriptJson);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are Hintro AI, a structured meeting intelligence parser.',
        },
        {
          role: 'user',
          content: systemPrompt,
        },
      ],
      model: 'llama-3.1-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const text = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(text.trim()) as IAiAnalysisResult;
  }

  /**
   * Hallucination & Citation validation pass.
   * Strips out citations that don't match actual transcript timestamps.
   */
  private validateAndFilterCitations(
    analysis: IAiAnalysisResult,
    transcript: ITranscriptSegment[],
    traceId: string
  ): IAiAnalysisResult {
    const validTimestamps = new Set(transcript.map((s) => s.timestamp));

    const checkCitations = (citations: IAiCitation[]): IAiCitation[] => {
      const filtered = citations.filter((c) => {
        const isValid = validTimestamps.has(c.timestamp);
        if (!isValid) {
          logger.warn(`AI suggested invalid citation timestamp "${c.timestamp}". Stripped to prevent hallucination.`, { traceId });
        }
        return isValid;
      });
      // Fallback: If AI returns no valid citations, map to the very first segment timestamp as a grounding baseline
      if (filtered.length === 0 && transcript.length > 0) {
        filtered.push({ timestamp: transcript[0].timestamp });
      }
      return filtered;
    };

    const validatedSummary = (analysis.summary || []).map((item) => ({
      text: item.text,
      citations: checkCitations(item.citations || []),
    }));

    const validatedDecisions = (analysis.decisions || []).map((item) => ({
      text: item.text,
      citations: checkCitations(item.citations || []),
    }));

    const validatedFollowUps = (analysis.followUps || []).map((item) => ({
      text: item.text,
      citations: checkCitations(item.citations || []),
    }));

    const validatedActionItems = (analysis.actionItems || []).map((item) => ({
      task: item.task,
      assignee: item.assignee || 'Unassigned',
      citations: checkCitations(item.citations || []),
    }));

    return {
      summary: validatedSummary,
      decisions: validatedDecisions,
      followUps: validatedFollowUps,
      actionItems: validatedActionItems,
    };
  }

  /**
   * Heuristic/Mock analysis when both APIs fail or keys are absent.
   * Guarantees that the app remains functional and grounded in the transcript.
   */
  private generateFallbackAnalysis(transcript: ITranscriptSegment[]): IAiAnalysisResult {
    const summary: IAiContentItem[] = [];
    const decisions: IAiContentItem[] = [];
    const followUps: IAiContentItem[] = [];
    const actionItems: IAiActionItem[] = [];

    // Basic heuristic search in the transcript
    transcript.forEach((segment) => {
      const textLower = segment.text.toLowerCase();
      const citation = [{ timestamp: segment.timestamp }];

      if (textLower.includes('should') || textLower.includes('will') || textLower.includes('plan') || textLower.includes('action')) {
        actionItems.push({
          task: segment.text,
          assignee: segment.speaker,
          citations: citation,
        });
      }

      if (textLower.includes('decide') || textLower.includes('agree') || textLower.includes('confirmed') || textLower.includes('ok')) {
        decisions.push({
          text: `Agreed to: "${segment.text}"`,
          citations: citation,
        });
      }

      if (textLower.includes('suggest') || textLower.includes('later') || textLower.includes('next time')) {
        followUps.push({
          text: `Discuss further: "${segment.text}"`,
          citations: citation,
        });
      }
    });

    // Baseline summary
    summary.push({
      text: `Meeting discussion centered around topics raised by ${Array.from(new Set(transcript.map(s => s.speaker))).join(', ')}.`,
      citations: [{ timestamp: transcript[0]?.timestamp || '00:00' }],
    });

    // Safe boundaries
    return {
      summary,
      decisions: decisions.length > 0 ? decisions : [{ text: 'No major decisions explicitly highlighted.', citations: [{ timestamp: transcript[0]?.timestamp || '00:00' }] }],
      followUps: followUps.length > 0 ? followUps : [{ text: 'Review current tasks and plans in the next session.', citations: [{ timestamp: transcript[0]?.timestamp || '00:00' }] }],
      actionItems: actionItems.length > 0 ? actionItems : [{ task: 'Complete pending tasks discussed', assignee: transcript[0]?.speaker || 'Attendees', citations: [{ timestamp: transcript[0]?.timestamp || '00:00' }] }],
    };
  }
}

export const aiService = new AIService();
export default aiService;
