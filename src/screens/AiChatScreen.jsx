import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import OrchestrateChatEmbed from '../components/OrchestrateChatEmbed';
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
        title={mode === 'result-discussion' ? 'Discuss This Result With AI' : 'AI Safety Chat'}
        subtitle={
          mode === 'result-discussion'
            ? 'The scored recommendation remains the primary app result. Use this chat for follow-up discussion and mitigation ideas only.'
            : 'General embedded AI safety chat for aviation decision-support conversation.'
        }
        actions={
          <button className="secondary-button" type="button" onClick={backToLanding}>
            Back to landing
          </button>
        }
      >
        {mode === 'result-discussion' ? (
          <div className="result-context-panel">
            <p className="eyebrow">Assessment Context Loaded</p>
            <div className="score-banner">
              <div>
                <span>Recommendation</span>
                <strong>{resultContext?.recommendation ?? 'Unavailable'}</strong>
              </div>
              <div>
                <span>Total score</span>
                <strong>{resultContext?.totalScore ?? 'Unavailable'}</strong>
              </div>
              <div>
                <span>Flight mode</span>
                <strong>{resultContext?.flightMode ?? 'Not provided'}</strong>
              </div>
            </div>

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

            <div className="notice">
              <p className="eyebrow">Important</p>
              <p>
                This chat can explain the completed assessment, but it does not
                recalculate the score, approve the flight, or replace official
                briefings, regulations, checklists, planning, or pilot
                judgment. Verify weather with AviationWeather.gov or
                1-800-WX-BRIEF before making a go/no-go decision.
              </p>
            </div>
          </div>
        ) : (
          <div className="integration-note">
            General chat mode
            <br />
            No assessment result is currently loaded. Ask a general preflight
            question, or{' '}
            <Link to="/flight-setup">complete a full assessment</Link> to discuss
            a specific result.
          </div>
        )}

      </SectionCard>

      <SectionCard title="Embedded Chat">
        <OrchestrateChatEmbed mode={mode} resultContext={assessmentContext} />
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
