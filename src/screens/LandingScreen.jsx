import { useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard';

function LandingScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen-grid">
      <div className="card landing-intro-note">
        <p>
          Start a structured preflight review using <strong>PAVE</strong>: Pilot, Aircraft, enVironment, and External pressures.
        <br />
          The app provides a decision-support result with optional AI discussion of key risk factors.
        </p>
      </div>

      <SectionCard
        title="Choose Your Starting Point"
        subtitle="AI-supported preflight risk assessment for general aviation decision support."
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
      </SectionCard>
    </div>
  );
}

export default LandingScreen;
