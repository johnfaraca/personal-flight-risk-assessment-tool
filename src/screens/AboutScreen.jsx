import { FaGithub, FaLinkedin } from 'react-icons/fa';
import teamEagleAiWordmark from '../assets/team_eagle_ai_wordmark_cropped.png';
import SectionCard from '../components/SectionCard';

function AboutScreen() {
  return (
    <div className="screen-grid">
      <SectionCard
        title="Personal Flight Risk Assessment Tool"
      >
        <img
          className="about-wordmark"
          src={teamEagleAiWordmark}
          alt="Team Eagle_AI wordmark"
        />
        <div className="factor-list">
          <div className="factor-row">
            <span>Project Identity</span>
            <strong>Team Eagle_AI</strong>
          </div>
          <div className="factor-row">
            <span>Developer</span>
            <strong>John Faraca</strong>
          </div>
          <div className="factor-row">
            <span>Affiliation</span>
            <strong>Embry-Riddle Aeronautical University</strong>
          </div>
          <div className="factor-row">
            <span>Year</span>
            <strong>2026</strong>
          </div>
          <div className="factor-row">
            <span>Assessment Model</span>
            <strong>Deterministic scoring first, AI discussion second</strong>
          </div>
        </div>
        <div className="about-icon-links">
          <a
            href="https://www.linkedin.com/in/john-faraca/"
            aria-label="LinkedIn Profile"
            target="_blank"
            rel="noreferrer"
          >
            <FaLinkedin />
          </a>
          <a
            href="https://github.com/johnfaraca"
            aria-label="GitHub Profile"
            target="_blank"
            rel="noreferrer"
          >
            <FaGithub />
          </a>
        </div>
      </SectionCard>

      <SectionCard title="How it works">
        <p>
          The tool guides users through flight setup, weather context, PAVE
          assessment, and results. It produces a deterministic recommendation based
          on selected risk factors and then offers AI-supported discussion for
          follow-up questions.
        </p>
      </SectionCard>

      <SectionCard title="About PAVE">
        <p>
          PAVE is a pilot risk-management framework used to organize preflight
          decision-making into four areas: Pilot, Aircraft, enVironment, and
          External pressures.
        </p>
        <p>
          This prototype uses PAVE to structure the assessment flow and help users
          review risk factors before viewing a decision-support result. The
          framework supports more consistent thinking, but it does not replace
          official briefings, regulations, aircraft performance calculations, or
          pilot judgment.
        </p>
      </SectionCard>

      <SectionCard title="AI use">
        <p>
          Deterministic scoring is the primary decision-support mechanism. The AI
          Safety Chat is supplemental and is used to help discuss completed results,
          risk drivers, and mitigation ideas. It does not calculate or override the
          final recommendation.
        </p>
      </SectionCard>

      <SectionCard title="Weather source note">
        <p>
          Weather data is loaded from the FAA Aviation Weather Center. Some factors
          use deterministic fallback mapping. Users should verify weather
          information with AviationWeather.gov and FAA Flight Service /
          1-800-WX-BRIEF before making a go/no-go decision.
        </p>
      </SectionCard>
      <SectionCard title="Privacy, Terms, and Safety Notice">
        <p>
          This application is an educational MVP and decision-support prototype. It is not an FAA-approved flight planning tool, weather briefing service, or source of operational flight authorization. Pilots remain responsible for obtaining official weather briefings, checking NOTAMs, complying with applicable regulations, and making final go/no-go decisions.
        </p>
        <p>
          The app does not intentionally collect or store personally identifiable information. Assessment inputs and results are used only to support the current session and may be stored temporarily in the browser through session storage. This prototype does not include user accounts, payment processing, database storage, or long-term server-side profile storage.
        </p>
        <p>
          The embedded AI chat may process user messages and assessment context through IBM watsonx Orchestrate. Users should avoid entering personal, sensitive, credential, medical, or private aircraft ownership information.
        </p>
        <p>
          By using this prototype, users acknowledge that outputs are informational only and should be verified with official aviation sources, including AviationWeather.gov, 1800wxbrief.com, FAA Flight Service, flight instructors, dispatchers, or other qualified aviation professionals as appropriate.
        </p>
      </SectionCard>
    </div>
  );
}

export default AboutScreen;
