import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QuestionGroup from '../components/QuestionGroup';
import SectionCard from '../components/SectionCard';
import { useAppContext } from '../state/AppContext';

function PaveAssessmentScreen() {
  const navigate = useNavigate();
  const {
    assessmentResult,
    appliedWeatherSignature,
    setAppliedWeatherSignature,
    weatherPicture,
    responses,
    setResponses,
    setMissionRule,
    ifrEligibility,
    setIfrEligibility,
    weatherReady
  } = useAppContext();
  const currentAssessmentMode = assessmentResult.ifrReassessmentUsed ? 'IFR' : 'VFR';
  const currentPreviewResult = assessmentResult.ifrReassessmentUsed
    ? assessmentResult.finalResult
    : assessmentResult.vfrResult;

  useEffect(() => {
    if (!weatherReady) {
      return;
    }

    if (appliedWeatherSignature === weatherPicture.signature) {
      return;
    }

    const allScoredItems = [
      ...weatherPicture.assessmentMetadata.pilot,
      ...weatherPicture.assessmentMetadata.aircraft,
      ...weatherPicture.assessmentMetadata.environment
    ];

    const clearedSelections = allScoredItems.reduce((accumulator, item) => {
      accumulator[item.id] = false;
      return accumulator;
    }, {});

    const autoSelections = allScoredItems
      .filter((item) => item.autoSelected)
      .reduce((accumulator, item) => {
        accumulator[item.id] = true;
        return accumulator;
      }, {});

    setResponses((current) => ({
      ...current,
      ...clearedSelections,
      ...autoSelections
    }));

    setIfrEligibility(null);
    setMissionRule('VFR');
    setAppliedWeatherSignature(weatherPicture.signature);
  }, [
    appliedWeatherSignature,
    setAppliedWeatherSignature,
    setIfrEligibility,
    setMissionRule,
    setResponses,
    weatherReady,
    weatherPicture.assessmentMetadata,
    weatherPicture.signature
  ]);

  useEffect(() => {
    if (assessmentResult.ifrPromptNeeded) {
      return;
    }

    setIfrEligibility(null);
    setMissionRule('VFR');
  }, [assessmentResult.ifrPromptNeeded, setIfrEligibility, setMissionRule]);

  function handleToggle(id, value) {
    setResponses((current) => ({
      ...current,
      [id]: value
    }));
  }

  function goToResults() {
    if (!weatherReady) {
      return;
    }

    if (assessmentResult.ifrPromptNeeded && ifrEligibility) {
      setMissionRule('IFR');
    } else {
      setMissionRule('VFR');
    }

    navigate('/results');
  }

  return (
    <div className="screen-grid">
      {!weatherReady ? (
        <SectionCard
          title="PAVE Assessment Unavailable"
          subtitle="Complete the flight setup and load live weather successfully before entering the assessment."
          actions={
            <button className="secondary-button" onClick={() => navigate('/weather-picture')}>
              Return to Weather Picture
            </button>
          }
        >
          <div className="notice">{weatherPicture.apiHook.note}</div>
        </SectionCard>
      ) : null}

      {weatherReady ? (
      <SectionCard
        title="PAVE Assessment"
        subtitle="Each scoring factor is presented as a yes/no question."
        actions={
          <div className="pave-header-actions">
            <button className="primary-button" onClick={goToResults}>
              Review recommendation
            </button>
          </div>
        }
      >
        <div className="pave-preview-layout">
          <div className="pave-preview-stats">
            <div className="stat-card">
              <span>Current score</span>
              <strong>{currentPreviewResult.score}</strong>
            </div>
            <div className="stat-card">
              <span>Recommendation</span>
              <strong>{currentPreviewResult.recommendation}</strong>
            </div>
            <div className="stat-card">
              <span>Assessment mode</span>
              <strong>{currentAssessmentMode}</strong>
            </div>
          </div>

          <div className="flight-setup-note">
            <p className="eyebrow">Review Recommendations</p>
            <p>
              Select Review recommendation to view the final scored result.
            </p>
          </div>
        </div>
        <div className="notice pave-preview-score-note">
          The preview score updates from your yes/no responses and any route/weather
          factors that map to the current flight inputs.
        </div>
      </SectionCard>
      ) : null}

      {weatherReady ? (
      <QuestionGroup
        title="Pilot"
        description="Personal readiness, proficiency, and physiological risk factors."
        items={weatherPicture.assessmentMetadata.pilot}
        responses={responses}
        onToggle={handleToggle}
      />
      ) : null}
      {weatherReady ? (
      <QuestionGroup
        title="Aircraft"
        description="Aircraft-specific readiness, fuel, loading, and runway margin factors."
        items={weatherPicture.assessmentMetadata.aircraft}
        responses={responses}
        onToggle={handleToggle}
      />
      ) : null}
      {weatherReady ? (
      <QuestionGroup
        title="enVironment"
        description="Operational weather, airport, and route environment factors."
        items={weatherPicture.assessmentMetadata.environment}
        responses={responses}
        onToggle={handleToggle}
      />
      ) : null}
      {weatherReady ? (
      <QuestionGroup
        title="External Pressures"
        description="External Pressures are shown for awareness but do not affect the current deterministic score."
        items={weatherPicture.assessmentMetadata.externalPressures}
        responses={responses}
        onToggle={handleToggle}
      />
      ) : null}

      {weatherReady && assessmentResult.ifrPromptNeeded ? (
        <SectionCard title="IFR Reassessment">
          <p>
            Can this flight be legally and safely conducted under IFR with this
            pilot-aircraft combination?
          </p>
          <div className="binary-choice">
            <button
              type="button"
              className={ifrEligibility === true ? 'toggle active' : 'toggle'}
              onClick={() => {
                setIfrEligibility(true);
                setMissionRule('IFR');
              }}
            >
              Yes, reassess under IFR
            </button>
            <button
              type="button"
              className={ifrEligibility === false ? 'toggle active off' : 'toggle off'}
              onClick={() => {
                setIfrEligibility(false);
                setMissionRule('VFR');
              }}
            >
              No, keep VFR result
            </button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default PaveAssessmentScreen;
