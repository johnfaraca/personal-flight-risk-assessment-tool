import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import OpenAIChat from '../components/OpenAIChat';
import SectionCard from '../components/SectionCard';
import { useAppContext } from '../state/AppContext';
import {
  isValidAssessmentContext,
  readActiveResultDiscussionContext
} from '../utils/assessmentContextStorage';

const RESET_WARNING =
  'Leaving the full PAVE assessment will clear your current flight setup, weather picture, PAVE answers, results, and AI discussion context. Continue?';

function AiChatScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { resetAssessmentState } = useAppContext();
  const state = location.state ?? {};
  const stateAssessmentContext = isValidAssessmentContext(state.assessmentContext)
    ? state.assessmentContext
    : null;
  const storedAssessmentContext = stateAssessmentContext ? null : readActiveResultDiscussionContext();
  const assessmentContext = stateAssessmentContext ?? storedAssessmentContext;
  const mode =
    state.mode === 'result-discussion' || assessmentContext
      ? 'result-discussion'
      : 'general';
  const resultContext = assessmentContext?.result ?? null;
  const topContributingFactors = resultContext?.topContributingFactors ?? [];
  const [showAssessmentContext, setShowAssessmentContext] = useState(false);

  function backToLanding() {
    if (mode === 'result-discussion') {
      if (!window.confirm(RESET_WARNING)) {
        return;
      }

      resetAssessmentState();
    }

    navigate('/');
  }

  return (
    <div className="screen-grid">
      <SectionCard
        title={mode === 'result-discussion' ? 'Assessment discussion' : 'General safety chat'}
        className="ai-chat-card"
        actions={
          <button className="secondary-button" type="button" onClick={backToLanding}>
            Back to landing
          </button>
        }
      >
        {mode === 'result-discussion' ? (
          <div className="result-context-panel">
            <p className="eyebrow">Assessment Context Loaded</p>
            <p className="assessment-discussion-summary">
              <span>
                <strong>Recommendation: {resultContext?.recommendation ?? 'Unavailable'}</strong>
              </span>
              <span>
                <span className="assessment-summary-separator" aria-hidden="true">·</span>
                <strong>Total score: {resultContext?.totalScore ?? 'Unavailable'}</strong>
              </span>
              <span>
                <span className="assessment-summary-separator" aria-hidden="true">·</span>
                <strong>Flight mode: {resultContext?.flightMode ?? 'Not provided'}</strong>
              </span>
            </p>

            <div className="assessment-context-actions">
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setShowAssessmentContext((current) => !current)}
              >
                {showAssessmentContext ? 'Hide assessment context' : 'Show assessment context'}
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => navigate('/results')}
              >
                View full results
              </button>
            </div>

            {showAssessmentContext ? (
              <AssessmentContextDetails
                assessmentContext={assessmentContext}
                topContributingFactors={topContributingFactors}
              />
            ) : null}
          </div>
        ) : null}

        <OpenAIChat mode={mode} resultContext={assessmentContext} />
      </SectionCard>
    </div>
  );
}

function AssessmentContextDetails({ assessmentContext, topContributingFactors }) {
  const advisoryItems = assessmentContext?.weather?.advisoriesNotices ?? [];

  return (
    <div className="factor-list">
      {topContributingFactors.length > 0 ? (
        topContributingFactors.map((factor) => (
          <div className="factor-row" key={factor.id}>
            <span>{factor.label}</span>
            <strong className={factor.weight > 0 ? 'positive' : 'negative'}>
              {factor.weight > 0 ? `+${factor.weight}` : factor.weight}
            </strong>
          </div>
        ))
      ) : (
        <p>No contributing factors were passed from the Results page.</p>
      )}
      {advisoryItems.length > 0 ? (
        <div className="notice">
          {advisoryItems.length} advisory or notice item
          {advisoryItems.length === 1 ? '' : 's'} included for AI context.
        </div>
      ) : null}
    </div>
  );
}

export default AiChatScreen;
