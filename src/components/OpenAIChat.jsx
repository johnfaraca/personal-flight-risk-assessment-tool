import { useRef, useState } from 'react';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;

const unavailableMessage =
  'AI Safety Chat is unavailable right now. The deterministic PAVE recommendation remains available; verify weather and planning details through official aviation sources.';

function OpenAIChat({ mode = 'general', resultContext = null }) {
  const [messages, setMessages] = useState(() => [createAssistantWelcomeMessage(mode)]);
  const [draftMessage, setDraftMessage] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null);
  const normalizedMode = mode === 'result-discussion' ? 'result-discussion' : 'general';
  const hasAssessmentContext = Boolean(resultContext?.result);
  const remainingCharacters = MAX_MESSAGE_LENGTH - draftMessage.length;

  async function submitMessage(event) {
    event.preventDefault();

    const userMessage = draftMessage.trim();

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

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          mode: normalizedMode,
          assessmentContext: hasAssessmentContext ? resultContext : null,
          history: toRecentHistory(nextMessages)
        })
      });

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(payload.message || unavailableMessage);
      }

      const assistantMessage = normalizeAssistantResponse(payload.message);
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('assistant', assistantMessage)
      ]);
      setStatus('idle');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error.message || unavailableMessage);
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('assistant', unavailableMessage)
      ]);
    }
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
      <div className="openai-chat-status-row">
        <span className="openai-chat-status-dot" aria-hidden="true" />
        <span>
          {normalizedMode === 'result-discussion'
            ? hasAssessmentContext
              ? 'Result context connected'
              : 'Result context unavailable'
            : 'General safety chat'}
        </span>
      </div>

      <div className="openai-chat-transcript" aria-live="polite">
        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? 'You' : 'AI Safety Chat'}</span>
            <p>{message.content}</p>
          </article>
        ))}
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

      <div className="integration-note">
        Educational decision support only. This chat is not an official briefing,
        flight clearance, or guarantee of safety.
      </div>
    </div>
  );
}

function toRecentHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content }));
}

function createAssistantWelcomeMessage(mode) {
  return createMessage(
    'assistant',
    mode === 'result-discussion'
      ? 'I can help explain the completed PAVE result and discuss mitigation ideas. The app recommendation stays authoritative, and the pilot remains responsible for the final decision.'
      : 'Ask a focused preflight safety question. I can help think through PAVE factors, but this is educational decision support, not an official briefing or clearance.'
  );
}

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content
  };
}

async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeAssistantResponse(message) {
  return typeof message === 'string' && message.trim() ? message.trim() : unavailableMessage;
}

export default OpenAIChat;
