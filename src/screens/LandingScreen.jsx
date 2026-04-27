import { useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard';

function LandingScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen-grid">
      <div className="card landing-intro-note">
        <p>
          AI-supported preflight risk review with structured decision support.
        </p>
      </div>

      <SectionCard
        title="Choose Your Starting Point"
        subtitle="Start a structured preflight review using PAVE or ask a general safety question."
      >
        <div className="landing-option-grid">
          <button
            className="entry-card"
            type="button"
            onClick={() => navigate('/flight-setup')}
          >
            <span className="eyebrow">Deterministic Flow</span>
            <strong>Start Full PAVE Assessment</strong>
            <span>
              Enter flight details, review weather context, complete PAVE factors, and
              receive the structured go / no-go recommendation.
            </span>
          </button>

          <button
            className="entry-card"
            type="button"
            onClick={() => navigate('/ai-chat')}
          >
            <span className="eyebrow">AI Safety Chat</span>
            <strong>Ask a Safety Question</strong>
            <span>
              Talk with the embedded watsonx Orchestrate assistant without changing
              the deterministic assessment results.
            </span>
          </button>
        </div>

        <div className="landing-pave-card">
          <p className="pave-note">
            <strong>PAVE</strong>: <strong>P</strong>ilot, <strong>A</strong>ircraft, en<strong>V</strong>ironment, and <strong>E</strong>xternal pressures.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

export default LandingScreen;
