import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import teamEagleAiLogo from '../assets/team_eagle_ai_logo2.png';
import { useAppContext } from '../state/AppContext';
import {
  clearActiveResultDiscussionContext,
  readActiveResultDiscussionContext
} from '../utils/assessmentContextStorage';

const appNavItems = [
  { to: '/', label: 'Home' },
  { to: '/flight-setup', label: 'Start Assessment' },
  { to: '/ai-chat', label: 'AI Safety Chat' },
  { to: '/about', label: 'About' }
];

const assessmentRoutes = ['/flight-setup', '/weather-picture', '/pave-assessment', '/results'];

const assessmentSteps = [
  { to: '/flight-setup', label: '1. Flight Setup' },
  { to: '/weather-picture', label: '2. Weather Picture' },
  { to: '/pave-assessment', label: '3. PAVE Assessment' },
  { to: '/results', label: '4. Results' }
];

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { resetAssessmentState } = useAppContext();
  const [pendingExitPath, setPendingExitPath] = useState(null);
  const isResultDiscussionChat =
    location.pathname === '/ai-chat' &&
    (location.state?.mode === 'result-discussion' || Boolean(readActiveResultDiscussionContext()));
  const showAssessmentNav = assessmentRoutes.includes(location.pathname) || isResultDiscussionChat;

  function requestAssessmentExit(path) {
    setPendingExitPath(path);
  }

  function confirmAssessmentExit() {
    const nextPath = pendingExitPath ?? '/';

    resetAssessmentState();
    setPendingExitPath(null);
    navigate(nextPath, { replace: true });
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="hero">
        <div className="card hero-card">
          <div className="header-brand">
            <img src={teamEagleAiLogo} alt="Team Eagle_AI logo" />
            <div className="header-brand-copy">
              <h1 className="app-title">Personal Flight Risk Assessment Tool</h1>
              <p className="brand-label">Team Eagle_AI</p>
              <p className="hero-support-line">
                Pilot go/no-go decision support.
              </p>
            </div>
          </div>
        </div>
        {showAssessmentNav ? (
          <div className="wizard-nav" aria-label="Assessment session controls">
            <div className="wizard-heading-row">
              <h2 className="wizard-title">Full PAVE Assessment</h2>
              <div className="wizard-actions">
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => requestAssessmentExit('/flight-setup')}
                >
                  Reset Assessment
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => requestAssessmentExit('/')}
                >
                  Exit Assessment
                </button>
              </div>
            </div>
          </div>
        ) : (
          <nav className="step-nav app-nav-card" aria-label="App navigation">
            {appNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={
                  item.to === '/ai-chat'
                    ? () => clearActiveResultDiscussionContext()
                    : undefined
                }
                className={({ isActive }) => `step-pill${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
        {showAssessmentNav ? (
          <nav className="step-nav assessment-step-nav" aria-label="Assessment steps">
            {assessmentSteps.map((step) => (
              <NavLink
                key={step.to}
                to={step.to}
                className={({ isActive }) => `step-pill${isActive ? ' active' : ''}`}
              >
                {step.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p>Team Eagle_AI · Developed by John Faraca · Embry-Riddle Aeronautical University · 2026</p>
        <p>
          Decision-support only — not a substitute for official briefings, flight
          planning, performance calculations, regulations, or pilot judgment.
        </p>
      </footer>
      {pendingExitPath ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-exit-title"
          >
            <h2 id="assessment-exit-title">Leave Assessment?</h2>
            <p>
              Leaving the full PAVE assessment will clear your current flight setup,
              weather picture, PAVE answers, results, and AI discussion context. Continue?
            </p>
            <div className="confirm-dialog-actions">
              <button
                className="primary-button"
                type="button"
                onClick={confirmAssessmentExit}
              >
                Continue and reset
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPendingExitPath(null)}
              >
                Stay in assessment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AppShell;
