import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { chatMessageToHistory, normalizeChatContent } from '../utils/aiChatResponse';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_FOLLOW_UP_LENGTH = 55;
const ASSISTANT_MARKDOWN_ELEMENTS = [
  'p', 'strong', 'em', 'ul', 'ol', 'li', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'code'
];

const unavailableMessage =
  'AI Safety Chat is unavailable right now. The deterministic PAVE recommendation remains available; verify weather and planning details through official aviation sources.';
const QUICK_START_PROMPTS = [
  'What is PAVE, and how does it help with preflight risk?',
  'How should I assess weather risk before flight?',
  'What human factors matter before a go/no-go decision?'
];
const AUTO_SUMMARY_SENT_KEY_PREFIX = 'ibmdss.silentAssessmentContextSent.';
const OPENING_ASSESSMENT_SUMMARY_PROMPT =
  'Give me a concise opening interpretation of this completed PAVE assessment.';

function OpenAIChat({ mode = 'general', resultContext = null }) {
  const [messages, setMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [followUps, setFollowUps] = useState([]);
  const inputRef = useRef(null);
  const normalizedMode = mode === 'result-discussion' ? 'result-discussion' : 'general';
  const assessmentContextKey = useMemo(() => getAssessmentContextKey(resultContext), [resultContext]);
  const autoSummaryRequestKeyRef = useRef(null);
  const previousAssessmentContextKeyRef = useRef(assessmentContextKey);
  const remainingCharacters = MAX_MESSAGE_LENGTH - draftMessage.length;
  const hasUserMessage = messages.some((message) => message.role === 'user');
  const showQuickStartPrompts = normalizedMode === 'general' && !hasUserMessage;
  const latestMessage = messages[messages.length - 1];
  const showFollowUps = latestMessage?.role === 'assistant' && followUps.length > 0;

  useEffect(() => {
    if (previousAssessmentContextKeyRef.current === assessmentContextKey) {
      return;
    }

    previousAssessmentContextKeyRef.current = assessmentContextKey;
    autoSummaryRequestKeyRef.current = null;
    setMessages([]);
    setDraftMessage('');
    setStatus('idle');
    setErrorMessage('');
    setFollowUps([]);
  }, [assessmentContextKey]);

  useEffect(() => {
    const shouldRequestOpeningSummary =
      normalizedMode === 'result-discussion' &&
      assessmentContextKey &&
      messages.length === 0 &&
      status === 'idle' &&
      autoSummaryRequestKeyRef.current !== assessmentContextKey &&
      !hasOpeningSummaryBeenSent(assessmentContextKey);

    if (!shouldRequestOpeningSummary) {
      return;
    }

    autoSummaryRequestKeyRef.current = assessmentContextKey;
    markOpeningSummarySent(assessmentContextKey);
    sendOpeningAssessmentSummary();
  }, [assessmentContextKey, messages.length, normalizedMode, status]);

  async function submitMessage(event) {
    event.preventDefault();
    await sendMessage(draftMessage);
  }

  async function sendMessage(messageText) {
    const userMessage = messageText.trim();

    if (!userMessage || status === 'loading') {
      return;
    }

    if (userMessage.length > MAX_MESSAGE_LENGTH) {
      setErrorMessage(`Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }

    const nextUserMessage = createMessage('user', userMessage);
    const nextMessages = [...messages, nextUserMessage];

    setMessages(nextMessages);
    setDraftMessage('');
    setStatus('loading');
    setErrorMessage('');
    setFollowUps([]);

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          mode: normalizedMode,
          assessmentContext: resultContext?.result ? resultContext : null,
          history: toRecentHistory(nextMessages),
          previousFollowUps: followUps
        })
      });

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.message || unavailableMessage);
      }

      const assistantMessage = createAssistantMessage(payload);
      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage
      ]);
      setFollowUps(normalizeFollowUps(payload.followUps));
      setStatus('idle');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error.message || unavailableMessage);
      setFollowUps([]);
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('assistant', unavailableMessage)
      ]);
    }
  }

  async function sendOpeningAssessmentSummary() {
    setStatus('loading');
    setErrorMessage('');
    setFollowUps([]);

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: OPENING_ASSESSMENT_SUMMARY_PROMPT,
          mode: normalizedMode,
          assessmentContext: resultContext?.result ? resultContext : null,
          history: [],
          previousFollowUps: []
        })
      });

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.message || unavailableMessage);
      }

      const assistantMessage = createAssistantMessage(payload);
      setMessages([assistantMessage]);
      setFollowUps(normalizeFollowUps(payload.followUps));
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error.message || unavailableMessage);
      setFollowUps([]);
      setMessages([createMessage('assistant', unavailableMessage)]);
    }
  }

  async function handleQuickStartPrompt(prompt) {
    setDraftMessage(prompt);
    await sendMessage(prompt);
  }

  async function handleFollowUp(followUp) {
    setDraftMessage(followUp);
    await sendMessage(followUp);
  }

  function handleDraftChange(event) {
    const nextValue = event.target.value;

    if (nextValue.length <= MAX_MESSAGE_LENGTH) {
      setDraftMessage(nextValue);
      setErrorMessage('');
      return;
    }

    setDraftMessage(nextValue.slice(0, MAX_MESSAGE_LENGTH));
    setErrorMessage(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  function handleDraftKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="openai-chat-shell">
      <div className="openai-chat-transcript" aria-live="polite">
        <ChatIntro mode={normalizedMode} />

        {showQuickStartPrompts ? (
          <div className="quick-start-prompts" aria-label="Quick start safety chat prompts">
            {QUICK_START_PROMPTS.map((prompt) => (
              <button
                className="quick-start-prompt"
                type="button"
                key={prompt}
                onClick={() => handleQuickStartPrompt(prompt)}
                disabled={status === 'loading'}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? 'You' : 'AI Safety Chat'}</span>
            {message.role === 'assistant' ? (
              <AssistantMessageContent message={message} />
            ) : (
              <p>{message.content}</p>
            )}
          </article>
        ))}
        {showFollowUps ? (
          <div className="chat-follow-ups" aria-label="Suggested follow-up messages">
            {followUps.map((followUp) => (
              <button
                className="chat-follow-up"
                type="button"
                key={followUp}
                onClick={() => handleFollowUp(followUp)}
                disabled={status === 'loading'}
              >
                {followUp}
              </button>
            ))}
          </div>
        ) : null}
        {status === 'loading' ? (
          <article className="chat-message assistant loading">
            <span>AI Safety Chat</span>
            <p>Reviewing your question.</p>
          </article>
        ) : null}
      </div>

      {errorMessage ? <div className="notice">{errorMessage}</div> : null}

      <form className="openai-chat-form" onSubmit={submitMessage}>
        <label className="sr-only" htmlFor="ai-chat-message">
          Message AI Safety Chat
        </label>
        <textarea
          id="ai-chat-message"
          ref={inputRef}
          value={draftMessage}
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
          placeholder={
            normalizedMode === 'result-discussion'
              ? 'Ask about this assessment result...'
              : 'Ask a preflight safety question...'
          }
          rows={3}
        />
        <div className="openai-chat-actions">
          <span>{remainingCharacters} characters left</span>
          <button className="primary-button compact-button" type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Sending' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

function toRecentHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES)
    .map(chatMessageToHistory);
}

export function AssistantMessageContent({ message }) {
  const { content, items = [], listType, footer } = message;
  const List = listType === 'numbered' ? 'ol' : 'ul';

  return (
    <div className="chat-markdown">
      {content ? (
        <ReactMarkdown skipHtml allowedElements={ASSISTANT_MARKDOWN_ELEMENTS} unwrapDisallowed>
          {content}
        </ReactMarkdown>
      ) : null}
      {items.length ? (
        <List>
          {items.map((item) => <li key={item}>{item}</li>)}
        </List>
      ) : null}
      {footer ? <p>{footer}</p> : null}
    </div>
  );
}

function ChatIntro({ mode }) {
  if (mode === 'result-discussion') {
    return (
      <section className="chat-intro-block" aria-label="Assessment discussion introduction">
        <h3>Assessment discussion</h3>
        <p>
          Ask about this completed PAVE result. I can explain the main risk drivers
          and discuss mitigation ideas. The application recommendation remains
          authoritative. This chat does not provide flight approval or replace
          official briefings, regulations, checklists, or pilot judgment.
        </p>
      </section>
    );
  }

  return (
    <section className="chat-intro-block compact" aria-label="General chat mode introduction">
      <p>
        Ask a focused preflight safety question. No assessment result is currently
        loaded. This chat provides educational decision support, not an official
        briefing or clearance.{' '}
        <Link to="/flight-setup">Complete a full assessment</Link> to discuss a
        specific result.
      </p>
    </section>
  );
}

function getAssessmentContextKey(assessmentContext) {
  if (!assessmentContext?.assessmentId || !assessmentContext?.createdAt || !assessmentContext?.result) {
    return '';
  }

  return `${assessmentContext.assessmentId}:${assessmentContext.createdAt}`;
}

function hasOpeningSummaryBeenSent(assessmentContextKey) {
  if (!assessmentContextKey || typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }

  try {
    return window.sessionStorage.getItem(`${AUTO_SUMMARY_SENT_KEY_PREFIX}${assessmentContextKey}`) === 'true';
  } catch {
    return false;
  }
}

function markOpeningSummarySent(assessmentContextKey) {
  if (!assessmentContextKey || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(`${AUTO_SUMMARY_SENT_KEY_PREFIX}${assessmentContextKey}`, 'true');
  } catch {
    // Storage is only a duplicate-request guard; chat can still function without it.
  }
}

function createMessage(role, content, list = normalizeChatContent()) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    items: list.items,
    listType: list.listType,
    footer: list.footer
  };
}

async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createAssistantMessage(payload) {
  const content = normalizeChatContent(payload);
  const normalizedMessage = normalizeMessageText(content.message);
  return createMessage(
    'assistant',
    normalizedMessage || (content.items.length || content.footer ? '' : unavailableMessage),
    content
  );
}

function normalizeFollowUps(followUps) {
  if (!Array.isArray(followUps)) {
    return [];
  }

  return followUps
    .filter((followUp) => typeof followUp === 'string' && followUp.trim())
    .map((followUp) => followUp.trim().slice(0, MAX_FOLLOW_UP_LENGTH).trim())
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeMessageText(message) {
  const messageText = stripMarkdownCodeFence(typeof message === 'string' ? message.trim() : '');

  if (!messageText) {
    return '';
  }

  const parsedMessage = parseMessageFromJsonText(messageText);

  if (parsedMessage) {
    return parsedMessage;
  }

  return isLikelyJsonText(messageText) ? '' : messageText;
}

function stripMarkdownCodeFence(value) {
  const fenceMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : value;
}

function parseMessageFromJsonText(value) {
  const jsonText = extractJsonObjectText(value);

  if (!jsonText) {
    return '';
  }

  try {
    const parsedValue = JSON.parse(jsonText);
    return typeof parsedValue?.message === 'string' ? parsedValue.message.trim() : '';
  } catch {
    const messageMatch = jsonText.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);

    if (!messageMatch) {
      return '';
    }

    try {
      return JSON.parse(`"${messageMatch[1]}"`).trim();
    } catch {
      return messageMatch[1].trim();
    }
  }
}

function extractJsonObjectText(value) {
  if (value.startsWith('{') && value.endsWith('}')) {
    return value;
  }

  const firstBraceIndex = value.indexOf('{');
  const lastBraceIndex = value.lastIndexOf('}');

  return firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex
    ? ''
    : value.slice(firstBraceIndex, lastBraceIndex + 1);
}

function isLikelyJsonText(value) {
  return value.startsWith('{') || value.startsWith('[') || value.includes('"message"');
}

export default OpenAIChat;
