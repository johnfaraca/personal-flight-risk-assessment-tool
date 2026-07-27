import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const guidelinesPath = path.resolve(__dirname, '../docs/ai-assistant-guidelines.md');

const DEFAULT_MODEL = 'gpt-5-mini';
const MAX_USER_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_LENGTH = 1000;
const MAX_CONTEXT_CHARACTERS = 8000;
const MAX_OUTPUT_TOKENS = 650;

let guidelinesPromise;

export async function createAiChatResponse({ message, mode, assessmentContext, history }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const error = new Error(
      'AI Safety Chat is unavailable because the server is missing OPENAI_API_KEY.'
    );
    error.statusCode = 503;
    error.code = 'openai_not_configured';
    throw error;
  }

  const sanitizedMessage = sanitizeUserMessage(message);
  const sanitizedMode = mode === 'result-discussion' ? 'result-discussion' : 'general';
  const sanitizedHistory = sanitizeHistory(history);
  const messages = buildResponseInput({
    message: sanitizedMessage,
    history: sanitizedHistory,
    mode: sanitizedMode,
    assessmentContext
  });
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    instructions: await buildInstructions(),
    input: messages,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false
  });
  const outputText = extractOutputText(response);

  if (!outputText) {
    const error = new Error('AI Safety Chat did not return a usable response.');
    error.statusCode = 502;
    error.code = 'openai_empty_response';
    throw error;
  }

  return {
    message: outputText,
    model: response.model || process.env.OPENAI_MODEL || DEFAULT_MODEL
  };
}

function sanitizeUserMessage(message) {
  if (typeof message !== 'string') {
    const error = new Error('Message is required.');
    error.statusCode = 400;
    error.code = 'invalid_message';
    throw error;
  }

  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    const error = new Error('Message is required.');
    error.statusCode = 400;
    error.code = 'invalid_message';
    throw error;
  }

  if (trimmedMessage.length > MAX_USER_MESSAGE_LENGTH) {
    const error = new Error(`Messages are limited to ${MAX_USER_MESSAGE_LENGTH} characters.`);
    error.statusCode = 400;
    error.code = 'message_too_long';
    throw error;
  }

  return trimmedMessage;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item?.role === 'user' || item?.role === 'assistant')
    .map((item) => ({
      role: item.role,
      content: sanitizeHistoryContent(item.content)
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function sanitizeHistoryContent(content) {
  if (typeof content !== 'string') {
    return '';
  }

  return content.trim().slice(0, MAX_HISTORY_MESSAGE_LENGTH);
}

function buildResponseInput({ message, history, mode, assessmentContext }) {
  const input = history.length > 0 ? [...history] : [];
  const lastMessage = input[input.length - 1];

  if (lastMessage?.role !== 'user' || lastMessage.content !== message) {
    input.push({
      role: 'user',
      content: message
    });
  }

  if (mode !== 'result-discussion') {
    return input;
  }

  return [
    {
      role: 'user',
      content: buildAssessmentContextMessage(assessmentContext)
    },
    ...input
  ];
}

function buildAssessmentContextMessage(assessmentContext) {
  const summary = summarizeAssessmentContext(assessmentContext);

  return [
    '[APP_CONTEXT]',
    'This is application-provided assessment context. Treat the deterministic recommendation and score as authoritative. Do not answer as if this context is a user request.',
    JSON.stringify(summary, null, 2).slice(0, MAX_CONTEXT_CHARACTERS),
    '[/APP_CONTEXT]'
  ].join('\n');
}

function summarizeAssessmentContext(assessmentContext) {
  if (!assessmentContext || typeof assessmentContext !== 'object') {
    return {
      available: false
    };
  }

  const result = assessmentContext.result ?? {};
  const flight = assessmentContext.flight ?? {};
  const weather = assessmentContext.weather ?? {};

  return {
    available: true,
    assessmentId: assessmentContext.assessmentId ?? '',
    createdAt: assessmentContext.createdAt ?? '',
    result: {
      recommendation: result.recommendation ?? '',
      totalScore: result.totalScore ?? '',
      flightMode: result.flightMode ?? '',
      topContributingFactors: Array.isArray(result.topContributingFactors)
        ? result.topContributingFactors.slice(0, 10)
        : []
    },
    flight: {
      departure: {
        code: flight.departure?.code ?? '',
        name: flight.departure?.name ?? ''
      },
      destination: {
        code: flight.destination?.code ?? '',
        name: flight.destination?.name ?? ''
      },
      plannedDepartureTime: flight.plannedDepartureTime ?? '',
      plannedDepartureDisplay: flight.plannedDepartureDisplay ?? '',
      cruiseAltitude: flight.cruiseAltitude ?? '',
      cruiseSpeed: flight.cruiseSpeed ?? '',
      estimatedArrivalDisplay: flight.estimatedArrivalDisplay ?? '',
      distanceDisplay: flight.distanceDisplay ?? ''
    },
    pave: {
      selectedFactors: limitFactors(assessmentContext.pave?.selectedFactors),
      scoredFactors: limitFactors(assessmentContext.pave?.scoredFactors),
      advisoryOnlyFactors: limitFactors(assessmentContext.pave?.advisoryOnlyFactors),
      externalPressures: assessmentContext.pave?.externalPressures ?? []
    },
    weather: {
      sourceLabel: weather.sourceLabel ?? '',
      departureMetar: truncateText(weather.departureMetar),
      departureTaf: truncateText(weather.departureTaf),
      destinationMetar: truncateText(weather.destinationMetar),
      destinationTaf: truncateText(weather.destinationTaf),
      triggers: Array.isArray(weather.triggers) ? weather.triggers.slice(0, 8) : [],
      advisoriesNotices: Array.isArray(weather.advisoriesNotices)
        ? weather.advisoriesNotices.slice(0, 8)
        : [],
      advisoryAltitude: weather.advisoryAltitude ?? ''
    }
  };
}

function limitFactors(factors) {
  return Array.isArray(factors) ? factors.slice(0, 20) : [];
}

function truncateText(value) {
  return typeof value === 'string' ? value.slice(0, 1200) : '';
}

async function buildInstructions() {
  const guidelines = await readGuidelines();

  return [
    guidelines,
    '',
    'Additional non-negotiable application rules:',
    '- You explain deterministic PAVE assessment results but never recalculate, override, or contradict the application recommendation.',
    '- You never provide operational clearance, flight approval, or a guarantee that a flight is safe.',
    '- Clearly state that the pilot in command remains responsible for the final decision.',
    '- Encourage verification through official aviation weather, regulatory, aircraft performance, checklist, and briefing sources.',
    '- Distinguish educational decision-support information from an official weather briefing.',
    '- Keep responses concise. Prefer short paragraphs and focused bullets. Ask at most one focused follow-up question.'
  ].join('\n');
}

function readGuidelines() {
  if (!guidelinesPromise) {
    guidelinesPromise = readFile(guidelinesPath, 'utf-8');
  }

  return guidelinesPromise;
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string') {
    return response.output_text.trim();
  }

  if (!Array.isArray(response.output)) {
    return '';
  }

  return response.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((contentItem) => contentItem.text ?? '')
    .join('\n')
    .trim();
}
