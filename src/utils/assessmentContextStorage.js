const ACTIVE_RESULT_DISCUSSION_CONTEXT_KEY = 'ibmdss.activeResultDiscussionContext';
const SILENT_ASSESSMENT_CONTEXT_SENT_KEY_PREFIX = 'ibmdss.silentAssessmentContextSent.';

function isBrowserStorageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage);
}

export function saveActiveResultDiscussionContext(assessmentContext) {
  if (!isValidAssessmentContext(assessmentContext) || !isBrowserStorageAvailable()) {
    return;
  }

  window.sessionStorage.setItem(
    ACTIVE_RESULT_DISCUSSION_CONTEXT_KEY,
    JSON.stringify({
      active: true,
      kind: 'result-discussion',
      assessmentContext
    })
  );
}

export function readActiveResultDiscussionContext() {
  if (!isBrowserStorageAvailable()) {
    return null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(ACTIVE_RESULT_DISCUSSION_CONTEXT_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : null;

    if (
      parsedValue?.active === true &&
      parsedValue?.kind === 'result-discussion' &&
      isValidAssessmentContext(parsedValue.assessmentContext)
    ) {
      return parsedValue.assessmentContext;
    }
  } catch (error) {
    console.error('[assessment-context] failed to read active context', error);
  }

  return null;
}

export function clearActiveResultDiscussionContext() {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.sessionStorage.removeItem(ACTIVE_RESULT_DISCUSSION_CONTEXT_KEY);
}

export function clearAssessmentSessionStorage() {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.sessionStorage.removeItem(ACTIVE_RESULT_DISCUSSION_CONTEXT_KEY);

  Object.keys(window.sessionStorage)
    .filter((key) => key.startsWith(SILENT_ASSESSMENT_CONTEXT_SENT_KEY_PREFIX))
    .forEach((key) => window.sessionStorage.removeItem(key));
}

export function isValidAssessmentContext(assessmentContext) {
  return Boolean(
    assessmentContext?.assessmentId &&
      assessmentContext?.createdAt &&
      assessmentContext?.result?.recommendation
  );
}
