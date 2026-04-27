import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard';
import StatGrid from '../components/StatGrid';
import { useAppContext } from '../state/AppContext';
import {
  saveActiveResultDiscussionContext
} from '../utils/assessmentContextStorage';

const RESET_WARNING =
  'Leaving the full PAVE assessment will clear your current flight setup, weather picture, PAVE answers, results, and AI discussion context. Continue?';

function ResultsScreen() {
  const navigate = useNavigate();
  const {
    assessmentResult,
    flightPlan,
    flightSetup,
    missionRule,
    responses,
    resetAssessmentState,
    weatherPicture
  } = useAppContext();
  const displayedContributingFactors = useMemo(
    () =>
      [...assessmentResult.topContributingFactors].sort((left, right) => {
        const leftIsPositive = left.weight > 0;
        const rightIsPositive = right.weight > 0;

        if (leftIsPositive !== rightIsPositive) {
          return leftIsPositive ? -1 : 1;
        }

        if (leftIsPositive) {
          return right.weight - left.weight;
        }

        return left.weight - right.weight;
      }),
    [assessmentResult.topContributingFactors]
  );
  const assessmentContext = useMemo(
    () =>
      buildAssessmentContext({
        assessmentResult,
        displayedContributingFactors,
        flightPlan,
        flightSetup,
        missionRule,
        responses,
        weatherPicture
      }),
    [
      assessmentResult,
      displayedContributingFactors,
      flightPlan,
      flightSetup,
      missionRule,
      responses,
      weatherPicture
    ]
  );

  useEffect(() => {
    saveActiveResultDiscussionContext(assessmentContext);
  }, [assessmentContext]);

  function discussResultWithAi() {
    saveActiveResultDiscussionContext(assessmentContext);
    navigate('/ai-chat', {
      state: {
        mode: 'result-discussion',
        assessmentContext
      }
    });
  }

  function startOver() {
    if (!window.confirm(RESET_WARNING)) {
      return;
    }

    resetAssessmentState();
    navigate('/flight-setup');
  }

  return (
    <div className="screen-grid">
      <SectionCard
        title="Results"
        subtitle="Review the deterministic recommendation and use AI Safety Chat for follow-up discussion."
        actions={
          <div className="results-header-actions">
            <div className="results-header-buttons">
              <button className="secondary-button" onClick={startOver}>
                Start over
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={discussResultWithAi}
              >
                Discuss this result with AI
              </button>
            </div>
          </div>
        }
      >
        <div className="results-summary-layout">
          <div className="results-summary-main">
            <div className="result-hero">
              <div>
                <span className="eyebrow">Final recommendation</span>
                <h2>{assessmentResult.finalRecommendation}</h2>
              </div>
              <div className="result-score">
                <span>Final score</span>
                <strong>{assessmentResult.finalScore}</strong>
              </div>
            </div>

            <StatGrid
              items={[
                { label: 'Assessment path', value: assessmentResult.scoringPathUsed },
                { label: 'Flight rules', value: missionRule },
                {
                  label: 'IFR reassessment',
                  value: assessmentResult.ifrReassessmentUsed ? 'Yes' : 'No'
                },
                {
                  label: 'Weather data',
                  value:
                    weatherPicture.apiHook.status === 'live'
                      ? 'FAA AWC'
                      : weatherPicture.apiHook.status === 'demo'
                        ? 'Weather loaded'
                        : 'Unavailable'
                }
              ]}
            />
          </div>

          <div className="flight-setup-note">
            <p className="eyebrow">AI Discussion Context</p>
            <p>
              Opens AI Safety Chat with this completed assessment, including the
              recommendation, score, flight rules, and top contributing factors. The
              scored recommendation remains the primary app result; AI is for follow-up
              discussion and mitigation ideas.
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard title="Top Contributing Factors">
          <div className="factor-list">
            {displayedContributingFactors.map((item) => (
              <div className="factor-row" key={item.id}>
                <span>{item.label}</span>
                <strong className={item.weight > 0 ? 'positive' : 'negative'}>
                  {item.weight > 0 ? `+${item.weight}` : item.weight}
                </strong>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Mitigation Suggestions">
          <ul className="clean-list">
            {assessmentResult.mitigationSuggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Important Note">
        <p>
          This prototype supports preflight decision-making, but it does not replace
          official briefings, flight planning, performance calculations, regulatory
          requirements, or pilot judgment. Any AI-generated explanation must remain
          separate from the scoring and recommendation.
        </p>
      </SectionCard>
    </div>
  );
}

function buildAssessmentContext({
  assessmentResult,
  displayedContributingFactors,
  flightPlan,
  flightSetup,
  missionRule,
  responses,
  weatherPicture
}) {
  const metadata = weatherPicture.assessmentMetadata;
  const selectedFactors = flattenAssessmentMetadata(metadata)
    .filter((item) => responses[item.id])
    .map(toContextFactor);
  const scoredFactors = flattenAssessmentMetadata(metadata)
    .filter((item) => responses[item.id] && !item.advisoryOnly)
    .map((item) => ({
      ...toContextFactor(item),
      weight: item.weights?.[missionRule] ?? null
    }));
  const advisoryOnlyFactors = flattenAssessmentMetadata(metadata)
    .filter((item) => responses[item.id] && item.advisoryOnly)
    .map(toContextFactor);
  const advisoryItems = weatherPicture.advisories?.items ?? [];
  const displayedHazards = weatherPicture.hazards.display ?? weatherPicture.hazards;
  const weatherDataUsed = weatherPicture.weatherDataUsed ?? {};
  const sourceLabel =
    weatherDataUsed.sourceLabel ||
    (weatherPicture.apiHook?.status === 'live'
      ? 'FAA AWC'
      : weatherPicture.apiHook?.status === 'demo'
        ? 'Weather loaded'
        : 'Unavailable');
  const metarTafData = buildMetarTafContextData(weatherDataUsed, weatherPicture);

  return {
    assessmentId: createAssessmentId(),
    createdAt: new Date().toISOString(),
    result: {
      recommendation: assessmentResult.finalRecommendation,
      totalScore: assessmentResult.finalScore,
      flightMode: missionRule || undefined,
      topContributingFactors: displayedContributingFactors.map((factor) => ({
        id: factor.id,
        label: factor.label,
        weight: factor.weight
      }))
    },
    flight: {
      departure: {
        code: flightPlan.departureAirport,
        name: flightPlan.departure?.name ?? weatherPicture.departure?.airportName ?? ''
      },
      destination: {
        code: flightPlan.destinationAirport,
        name: flightPlan.destination?.name ?? weatherPicture.destination?.airportName ?? ''
      },
      plannedDepartureTime: flightSetup.plannedDepartureTime,
      plannedDepartureDisplay: flightPlan.formattedDepartureTime,
      cruiseAltitude: flightSetup.cruiseAltitude,
      cruiseSpeed: flightPlan.cruiseSpeed ?? flightSetup.cruiseSpeed,
      estimatedArrivalTime: flightPlan.estimatedArrivalTime,
      estimatedArrivalDisplay: weatherPicture.estimatedArrivalTime,
      distanceNm: flightPlan.routeDistanceNm,
      distanceDisplay: flightPlan.routeDistanceDisplay
    },
    pave: {
      selectedFactors,
      scoredFactors,
      advisoryOnlyFactors,
      externalPressures: assessmentResult.externalPressureFlags
    },
    weather: {
      sourceLabel,
      departureMetar: metarTafData.departureMetar,
      departureTaf: metarTafData.departureTaf,
      destinationMetar: metarTafData.destinationMetar,
      destinationTaf: metarTafData.destinationTaf,
      dataUsed: {
        sourceLabel,
        departure: {
          metar: metarTafData.departureMetar,
          taf: metarTafData.departureTaf
        },
        destination: {
          metar: metarTafData.destinationMetar,
          taf: metarTafData.destinationTaf
        }
      },
      metarTafSnippets: {
        departureMetar: metarTafData.departureMetar,
        departureTaf: metarTafData.departureTaf,
        destinationMetar: metarTafData.destinationMetar,
        destinationTaf: metarTafData.destinationTaf
      },
      triggers: [
        toWeatherTrigger('Convection', displayedHazards.convection),
        toWeatherTrigger('Icing at planned altitude', displayedHazards.icing),
        toWeatherTrigger('Precipitation / visibility concern', displayedHazards.precipitationVisibility),
        displayedHazards.interpretation
          ? toWeatherTrigger('Route interpretation', displayedHazards.interpretation)
          : null
      ].filter(Boolean),
      advisoriesNotices: advisoryItems.map((item) => ({
        id: item.id,
        source: item.source,
        title: item.title,
        impact: item.impact,
        summary: item.summary,
        mappedFactorLabels: item.mappedFactorLabels ?? [],
        advisoryOnlyReason: item.advisoryOnlyReason ?? null,
        altitudeDisplay: item.altitudeDisplay ?? null
      })),
      advisoryAltitude: advisoryItems.find((item) => item.altitudeDisplay)?.altitudeDisplay ?? null
    }
  };
}

function buildMetarTafContextData(weatherDataUsed, weatherPicture) {
  return {
    departureMetar:
      normalizeWeatherText(weatherDataUsed.departure?.metar) ||
      rawLookingWeatherText(weatherPicture.departure?.summary, 'METAR'),
    departureTaf:
      normalizeWeatherText(weatherDataUsed.departure?.taf) ||
      rawLookingWeatherText(weatherPicture.departure?.summary, 'TAF'),
    destinationMetar:
      normalizeWeatherText(weatherDataUsed.destination?.metar) ||
      rawLookingWeatherText(weatherPicture.destination?.summary, 'METAR'),
    destinationTaf:
      normalizeWeatherText(weatherDataUsed.destination?.taf) ||
      rawLookingWeatherText(weatherPicture.destination?.summary, 'TAF')
  };
}

function rawLookingWeatherText(value, reportType) {
  const text = normalizeWeatherText(value);

  if (!text) {
    return '';
  }

  const upperText = text.toUpperCase();

  if (reportType === 'TAF') {
    return upperText.startsWith('TAF ') || upperText.startsWith('TAF AMD ') ? text : '';
  }

  return upperText.includes(' METAR ') || upperText.startsWith('METAR ') || /^[A-Z0-9]{4}\s+\d{6}Z\b/.test(upperText)
    ? text
    : '';
}

function normalizeWeatherText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function flattenAssessmentMetadata(metadata) {
  return [
    ...(metadata?.pilot ?? []),
    ...(metadata?.aircraft ?? []),
    ...(metadata?.environment ?? []),
    ...(metadata?.externalPressures ?? [])
  ];
}

function toContextFactor(item) {
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    advisoryOnly: Boolean(item.advisoryOnly),
    autoSelected: Boolean(item.autoSelected)
  };
}

function toWeatherTrigger(label, trigger) {
  return {
    label,
    level: trigger?.level ?? 'None',
    summary: trigger?.summary ?? ''
  };
}

function createAssessmentId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `assessment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default ResultsScreen;
