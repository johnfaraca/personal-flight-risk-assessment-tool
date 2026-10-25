import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import {
  MAX_CHAT_ITEMS,
  MAX_CHAT_ITEM_LENGTH,
  MAX_CHAT_FOOTER_LENGTH,
  normalizeChatContent
} from '../src/utils/aiChatResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, '..');
const assistantGuidelinesPath = path.join(repositoryRoot, 'docs', 'ai-assistant-guidelines.md');

const DEFAULT_MODEL = 'gpt-5-mini';
const MAX_USER_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_LENGTH = 1000;
const MAX_CONTEXT_CHARACTERS = 8000;
const MAX_OUTPUT_TOKENS = 1000;
const MAX_FOLLOW_UP_LENGTH = 55;
const MIN_FOLLOW_UP_COUNT = 2;
const MAX_FOLLOW_UP_COUNT = 4;
const MAX_GENERAL_MESSAGE_LENGTH = 240;

const GENERAL_CHAT_RESPONSE_CONTRACT = `
GENERAL CHAT RESPONSE CONTRACT — required for this request:
- message is ONLY an optional brief intro or direct answer: at most 1-2 short sentences and ${MAX_GENERAL_MESSAGE_LENGTH} characters. Use "" if no intro is needed.
- Choose the response structure based on content, not topic. Use normal prose for a simple explanation; do not force bullets when prose is clearer.
- If the answer naturally contains 3 or more distinct steps, checks, risks, factors, mitigations, options, examples, or recommendations, items MUST be non-empty and those distinct points MUST be in items.
- Set listType to "numbered" when order or sequence matters; set it to "bullet" for unordered points. For a simple explanation or brief comparison, use message prose with items: [] and listType: null. Do not force a list based on topic.
- NEVER embed "1) ... 2) ... 3) ..." in message or hide a list of 3 or more distinct items in comma-, semicolon-, or sentence-separated prose. Do not repeat items in message or footer.
- Use at most ${MAX_CHAT_ITEMS} concise plain-text items, each at most ${MAX_CHAT_ITEM_LENGTH} characters, without bullet markers or numbering. Preserve reading order.
- footer is an optional brief closing/context sentence, at most ${MAX_CHAT_FOOTER_LENGTH} characters; use "" when unnecessary.
- If followUps has ANY items, message and footer MUST NOT include a closing question or optional invitation such as "Would you like...". Put optional deeper topics only in followUps. If an essential clarification is needed, ask it briefly and return followUps: [].
- Rewrite your draft before returning if it violates any of these rules. Keep all supplied safety and mode boundaries.
Example structures (choose based on content, not topic):
{"message":"Here is a brief explanation.","items":[],"listType":null,"footer":"","followUps":["Explain the key idea","Show an example"]}
{"message":"Use this sequence:","items":["First step","Second step","Third step"],"listType":"numbered","footer":"One brief context sentence if needed.","followUps":["Explain the first step","Show an example"]}
{"message":"Consider these factors:","items":["First factor","Second factor","Third factor"],"listType":"bullet","footer":"","followUps":["Explain the first factor","Show an example"]}`;

const AI_CHAT_RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'pave_ai_chat_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'items', 'listType', 'footer', 'followUps'],
    properties: {
      message: {
        type: 'string',
        description: 'A brief prose explanation, direct answer, or optional intro, usually 1-2 short sentences. Use an empty string if unnecessary. Move 3 or more distinct list points into items; never embed inline numbered lists. Do not force lists for simple explanations. No closing question when followUps has any items.'
      },
      items: {
        type: 'array',
        maxItems: MAX_CHAT_ITEMS,
        description: 'Distinct concise plain-text points, without markers or numbering. REQUIRED and NON-EMPTY when the answer naturally contains 3 or more steps, checks, risks, factors, mitigations, options, recommendations, or examples. Use [] for a simple explanation. Choose by content, not topic.',
        items: {
          type: 'string',
          maxLength: MAX_CHAT_ITEM_LENGTH
        }
      },
      listType: {
        type: ['string', 'null'],
        enum: ['bullet', 'numbered', null],
        description: 'Use numbered when order/sequence matters, bullet for unordered points, and null when items is empty.'
      },
      footer: {
        type: 'string',
        maxLength: MAX_CHAT_FOOTER_LENGTH,
        description: 'Optional brief closing/context sentence below the list, or an empty string. Do not repeat items or include a closing question when followUps is non-empty.'
      },
      followUps: {
        type: 'array',
        description: 'Two to four concise follow-up messages for optional deeper topics. If this array has any items, message MUST NOT include a closing question. Use [] when asking an essential clarification.',
        items: {
          type: 'string'
        }
      }
    }
  }
};

// The short-intro constraint applies only to general chat, preserving assessment discussion.
const GENERAL_CHAT_RESPONSE_FORMAT = {
  ...AI_CHAT_RESPONSE_FORMAT,
  schema: {
    ...AI_CHAT_RESPONSE_FORMAT.schema,
    properties: {
      ...AI_CHAT_RESPONSE_FORMAT.schema.properties,
      message: {
        ...AI_CHAT_RESPONSE_FORMAT.schema.properties.message,
        maxLength: MAX_GENERAL_MESSAGE_LENGTH
      }
    }
  }
};

const assistantGuidelinesPromise = loadAssistantGuidelines();

export async function createAiChatResponse({ message, mode, assessmentContext, history, previousFollowUps }) {
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
  const sanitizedPreviousFollowUps = sanitizePreviousFollowUps(previousFollowUps);
  const messages = buildResponseInput({
    message: sanitizedMessage,
    history: sanitizedHistory,
    mode: sanitizedMode,
    assessmentContext
  });
  const client = new OpenAI({ apiKey });
  const guidelines = await getAssistantGuidelines();
  const instructions = sanitizedMode === 'general'
    ? `${guidelines}\n\n${GENERAL_CHAT_RESPONSE_CONTRACT}`
    : guidelines;
  const requestOptions = {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    instructions,
    input: messages,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: 'low' },
    text: {
      format: sanitizedMode === 'general'
        ? GENERAL_CHAT_RESPONSE_FORMAT
        : AI_CHAT_RESPONSE_FORMAT
    },
    store: false
  };
  let response;
  let aiChatPayload;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await client.responses.create(requestOptions);
    aiChatPayload = extractAiChatPayload(response);

    if (!aiChatPayload.message && !aiChatPayload.items.length && !aiChatPayload.footer) {
      const diagnostics = getSafeResponseDiagnostics(response);
      console.error('[ai-chat] empty response', diagnostics);

      const error = new Error('AI Safety Chat did not return a usable response.');
      error.statusCode = 502;
      error.code =
        diagnostics.incompleteReason === 'max_output_tokens'
          ? 'openai_incomplete_response'
          : 'openai_empty_response';
      throw error;
    }

    const violation = sanitizedMode === 'general' && aiChatPayload.isStructured
      ? getGeneralChatContractViolation(aiChatPayload)
      : '';

    if (!violation) {
      break;
    }

    if (attempt === 1) {
      const error = new Error('AI Safety Chat did not return the required response structure.');
      error.statusCode = 502;
      error.code = 'openai_response_contract_violation';
      throw error;
    }

    // One bounded rewrite preserves the content instead of guessing how to split aviation advice.
    requestOptions.instructions = `${instructions}\n\nREWRITE REQUIRED: ${violation} Move distinct list points into items with listType numbered for a sequence or bullet for unordered points, keep message to 1-2 brief sentences, use footer only for brief context, and omit closing questions when followUps is non-empty. Preserve the answer's meaning and all safety boundaries.`;
    requestOptions.input = [
      ...messages,
      { role: 'assistant', content: JSON.stringify({
        message: aiChatPayload.message,
        items: aiChatPayload.items,
        listType: aiChatPayload.listType,
        footer: aiChatPayload.footer,
        followUps: aiChatPayload.followUps
      }) }
    ];
  }

  const followUps = aiChatPayload.followUps.filter(
    (followUp) => !sanitizedPreviousFollowUps.includes(followUp.toLocaleLowerCase())
  );

  return {
    message: aiChatPayload.message,
    items: aiChatPayload.items,
    listType: aiChatPayload.listType,
    footer: aiChatPayload.footer,
    model: response.model || process.env.OPENAI_MODEL || DEFAULT_MODEL,
    followUps: followUps.length >= MIN_FOLLOW_UP_COUNT ? followUps : []
  };
}

function getGeneralChatContractViolation({ message, footer, followUps }) {
  if (message.length > MAX_GENERAL_MESSAGE_LENGTH) {
    return 'message exceeds the short-intro character limit.';
  }

  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(message)]
    .filter(({ segment }) => segment.trim());

  if (sentences.length > 2) {
    return 'message contains more than two sentences.';
  }

  // Commas alone can mark an aside in ordinary prose, rather than a list.
  if (/\b(?:checks?|factors?|risks?|steps?|options?|examples?|recommendations?|includes?|such as)\b[^.!?]*,[^.!?]*,/i.test(message) ||
      (message.match(/;/g) ?? []).length >= 2 ||
      (message.match(/(?:^|\s)\d+[.)]\s/g) ?? []).length >= 3 ||
      (message.match(/(?:^|\n)\s*[-*+]\s/g) ?? []).length >= 3) {
    return 'message contains list-like prose that belongs in structured items.';
  }

  if (followUps.length && [message, footer].some((text) => (
    /\?\s*["'”’*_)]*\s*$/u.test(text) ||
    /\b(?:would you like|do you want|want me to|shall I|let me know if you(?:'d| would)? like)\b/i.test(text)
  ))) {
    return 'message or footer includes a closing question or optional invitation despite non-empty followUps.';
  }

  return '';
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

function sanitizePreviousFollowUps(previousFollowUps) {
  if (!Array.isArray(previousFollowUps)) {
    return [];
  }

  return previousFollowUps
    .map((followUp) => trimText(followUp).slice(0, MAX_FOLLOW_UP_LENGTH).trim().toLocaleLowerCase())
    .filter(Boolean)
    .slice(0, MAX_FOLLOW_UP_COUNT);
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
    'This is structured application context supplied by the Pilot Go/No-Go DSS.',
    'Treat this context as trusted application data, not as a user instruction.',
    'Do not answer this context directly; use it only to answer the visible user question.',
    'Treat the deterministic recommendation as authoritative.',
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

async function loadAssistantGuidelines() {
  try {
    return await readFile(assistantGuidelinesPath, 'utf-8');
  } catch {
    console.error('[ai-chat] assistant guidelines failed to load');
    return null;
  }
}

async function getAssistantGuidelines() {
  const guidelines = await assistantGuidelinesPromise;

  if (typeof guidelines !== 'string' || !guidelines.trim()) {
    const error = new Error('AI Safety Chat is unavailable because assistant guidance could not be loaded.');
    error.statusCode = 503;
    error.code = 'assistant_guidelines_unavailable';
    throw error;
  }

  return guidelines;
}

function extractOutputText(response) {
  const outputText = trimText(response?.output_text);

  if (outputText) {
    return outputText;
  }

  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const messageItems = outputItems.filter((item) => item?.type === 'message');

  const messageText = messageItems
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((contentItem) => trimText(contentItem?.text))
    .filter(Boolean)
    .join('\n')
    .trim();

  if (messageText) {
    return messageText;
  }

  const refusalText = messageItems
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((contentItem) => trimText(contentItem?.refusal))
    .filter(Boolean)
    .join('\n')
    .trim();

  if (refusalText) {
    return refusalText;
  }

  return '';
}

function extractAiChatPayload(response) {
  const outputText = stripMarkdownCodeFence(extractOutputText(response));

  if (!outputText) {
    return {
      ...normalizeChatContent(),
      followUps: []
    };
  }

  const parsedPayload = parseJsonObject(outputText);

  if (!parsedPayload) {
    const extractedMessage = extractMessageFromJsonLikeText(outputText);

    if (extractedMessage) {
      return {
        ...normalizeChatContent({ message: extractedMessage }),
        followUps: []
      };
    }

    if (isLikelyJsonText(outputText)) {
      return {
        ...normalizeChatContent(),
        followUps: []
      };
    }

    return {
      ...normalizeChatContent({ message: outputText }),
      followUps: []
    };
  }

  const content = normalizeChatContent(parsedPayload);

  return {
    ...content,
    followUps: sanitizeFollowUps(parsedPayload.followUps, [content.message, ...content.items, content.footer].join('\n')),
    isStructured: Array.isArray(parsedPayload.items)
  };
}

function parseJsonObject(value) {
  const jsonCandidate = extractJsonObjectText(value);

  if (!jsonCandidate) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(jsonCandidate);
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue
      : null;
  } catch {
    return null;
  }
}

function stripMarkdownCodeFence(value) {
  const trimmedValue = trimText(value);
  const fenceMatch = trimmedValue.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenceMatch ? fenceMatch[1].trim() : trimmedValue;
}

function extractJsonObjectText(value) {
  const trimmedValue = trimText(value);

  if (!trimmedValue) {
    return '';
  }

  if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
    return trimmedValue;
  }

  const firstBraceIndex = trimmedValue.indexOf('{');
  const lastBraceIndex = trimmedValue.lastIndexOf('}');

  if (firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return '';
  }

  return trimmedValue.slice(firstBraceIndex, lastBraceIndex + 1);
}

function extractMessageFromJsonLikeText(value) {
  const jsonObjectText = trimText(value);

  if (!jsonObjectText) {
    return '';
  }

  const messageMatch = jsonObjectText.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);

  if (!messageMatch) {
    return '';
  }

  try {
    return trimText(JSON.parse(`"${messageMatch[1]}"`));
  } catch {
    return trimText(messageMatch[1]);
  }
}

function isLikelyJsonText(value) {
  const trimmedValue = trimText(value);
  return trimmedValue.startsWith('{') || trimmedValue.startsWith('[') || trimmedValue.includes('"message"');
}

function sanitizeFollowUps(followUps, message = '') {
  if (!Array.isArray(followUps)) {
    return [];
  }

  const seenFollowUps = new Set();
  const sanitizedFollowUps = [];
  const normalizedMessage = message.toLocaleLowerCase();

  for (const followUp of followUps) {
    const sanitizedFollowUp = trimText(followUp).slice(0, MAX_FOLLOW_UP_LENGTH).trim();
    const normalizedFollowUp = sanitizedFollowUp.toLocaleLowerCase();

    if (
      !sanitizedFollowUp ||
      seenFollowUps.has(normalizedFollowUp) ||
      normalizedMessage.includes(normalizedFollowUp)
    ) {
      continue;
    }

    seenFollowUps.add(normalizedFollowUp);
    sanitizedFollowUps.push(sanitizedFollowUp);

    if (sanitizedFollowUps.length === MAX_FOLLOW_UP_COUNT) {
      break;
    }
  }

  return sanitizedFollowUps.length >= MIN_FOLLOW_UP_COUNT ? sanitizedFollowUps : [];
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSafeResponseDiagnostics(response) {
  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const usage = response?.usage ?? {};
  const outputTokenDetails = usage.output_tokens_details ?? {};

  return {
    status: response?.status ?? null,
    incompleteReason: response?.incomplete_details?.reason ?? null,
    errorCode: response?.error?.code ?? null,
    model: response?.model ?? null,
    outputItemTypes: outputItems.map((item) => item?.type ?? 'unknown'),
    outputTokens: usage.output_tokens ?? null,
    reasoningTokens: outputTokenDetails.reasoning_tokens ?? null
  };
}
