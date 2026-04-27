import { useEffect, useRef, useState } from 'react';

const ORCHESTRATE_SCRIPT_ID = 'watsonx-orchestrate-chat-script';
const SILENT_ASSESSMENT_CONTEXT_SENT_KEY_PREFIX = 'ibmdss.silentAssessmentContextSent.';

let scriptLoadPromise = null;

const orchestrateConfiguration = {
  orchestrationID: '8436b88d749240feb8c33935502202d1_e8aa2688-fe9a-45b8-9e56-7b085a6a1242',
  hostURL: 'https://eu-gb.watson-orchestrate.cloud.ibm.com',
  rootElementID: 'root',
  deploymentPlatform: 'ibmcloud',
  crn: 'crn:v1:bluemix:public:watsonx-orchestrate:eu-gb:a/8436b88d749240feb8c33935502202d1:e8aa2688-fe9a-45b8-9e56-7b085a6a1242::',
  chatOptions: {
    agentId: 'a281dcfe-531e-4aed-bb51-a50c9ff93687',
    agentEnvironmentId: '41e5725b-6b61-4f8a-8690-29faaf1ab059'
  }
};

function OrchestrateChatEmbed({ mode = 'general', resultContext = null }) {
  const chatHostRef = useRef(null);
  const silentSentAssessmentRef = useRef(null);
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    const hostElement = chatHostRef.current;
    const assessmentContext = normalizeAssessmentContext(resultContext);
    const assessmentContextPayload = buildAssessmentContextPayload(mode, resultContext);

    if (!hostElement) {
      console.error('[orchestrate-chat] host element missing during initialization');
      setLoadState('error');
      return undefined;
    }

    window.wxOConfiguration = {
      ...orchestrateConfiguration,
      chatOptions: {
        ...orchestrateConfiguration.chatOptions,
        onLoad: (instance) => {
          instance?.on?.('chat:ready', async () => {
            if (mode !== 'result-discussion') {
              return;
            }

            const assessmentId = assessmentContext?.assessmentId;

            if (!assessmentId || silentSentAssessmentRef.current === assessmentId) {
              return;
            }

            if (hasSilentAssessmentContextBeenSent(assessmentId)) {
              silentSentAssessmentRef.current = assessmentId;
              return;
            }

            if (!buildSilentAssessmentContextMessage(assessmentContext) || !instance?.send) {
              return;
            }

            try {
              await instance.send(buildSilentAssessmentContextMessage(assessmentContext), { silent: true });
              silentSentAssessmentRef.current = assessmentId;
              markSilentAssessmentContextSent(assessmentId);

              if (import.meta.env.DEV) {
                console.info('Silent assessment context sent to Orchestrate.');
              }
            } catch (error) {
              if (import.meta.env.DEV) {
                console.error('[orchestrate-chat] failed to send silent assessment context', error);
              }
            }
          });

          if (!assessmentContextPayload || !instance?.on) {
            return;
          }

          instance.on('pre:send', (event) => {
            if (!event?.message) {
              return;
            }

            event.message.context = {
              ...event.message.context,
              ...assessmentContextPayload
            };

            logAssessmentContextDiagnostic(assessmentContextPayload, event.message.context);
          });
        }
      },
      layout: {
        form: 'custom',
        customElement: hostElement,
        showOrchestrateHeader: true
      }
    };

    loadOrchestrateScript()
      .then(() => {
        if (cancelled) {
          return;
        }

        if (!window.wxoLoader?.init) {
          throw new Error('watsonx Orchestrate loader did not expose init().');
        }

        if (!chatHostRef.current) {
          throw new Error('watsonx Orchestrate host element is unavailable.');
        }

        window.wxoLoader.init();
        setLoadState('ready');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error('[orchestrate-chat] failed to load embedded chat', error);
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [mode, resultContext]);

  return (
    <div className="orchestrate-embed-shell">
      {loadState === 'loading' ? (
        <div className="integration-note">Loading IBM watsonx Orchestrate chat.</div>
      ) : null}
      {loadState === 'error' ? (
        <div className="notice">
          IBM watsonx Orchestrate chat could not be loaded. The deterministic PAVE
          assessment remains available.
        </div>
      ) : null}
      <div ref={chatHostRef} className="orchestrate-chat-root" />
    </div>
  );
}

function buildAssessmentContextPayload(mode, resultContext) {
  const assessmentContext = normalizeAssessmentContext(resultContext);
  const result = assessmentContext?.result;

  if (mode !== 'result-discussion' || !result) {
    return null;
  }

  const weatherReports = getAssessmentWeatherReports(assessmentContext);
  const routeDeparture = assessmentContext.flight?.departure?.code ?? '';
  const routeDestination = assessmentContext.flight?.destination?.code ?? '';
  const weatherSource = assessmentContext.weather?.sourceLabel ?? '';
  const weatherTriggerSummary = buildWeatherTriggerSummary(assessmentContext);
  const weatherAdvisoriesSummary = buildWeatherAdvisoriesSummary(assessmentContext);
  const topFactors = Array.isArray(result.topContributingFactors)
    ? result.topContributingFactors
        .map((factor) => {
          if (typeof factor === 'string') {
            return factor;
          }

          const label = factor?.label;

          if (!label) {
            return null;
          }

          return typeof factor.weight === 'number' ? `${label} (${factor.weight})` : label;
        })
        .filter(Boolean)
        .join('; ')
    : '';

  return {
    assessment_mode: mode,
    assessment_id: assessmentContext.assessmentId ?? '',
    assessment_created_at: assessmentContext.createdAt ?? '',
    assessment_recommendation: result.recommendation ?? '',
    assessment_total_score:
      result.totalScore === null || result.totalScore === undefined
        ? ''
        : String(result.totalScore),
    assessment_top_factors: topFactors,
    assessment_flight_mode: result.flightMode ?? '',
    assessment_departure_airport: routeDeparture,
    assessment_destination_airport: routeDestination,
    assessment_planned_departure_time: assessmentContext.flight?.plannedDepartureTime ?? '',
    assessment_cruise_altitude: stringifyContextValue(assessmentContext.flight?.cruiseAltitude),
    assessment_cruise_speed: stringifyContextValue(assessmentContext.flight?.cruiseSpeed),
    assessment_weather_source: weatherSource,
    assessment_departure_metar: weatherReports.departureMetar,
    assessment_departure_taf: weatherReports.departureTaf,
    assessment_destination_metar: weatherReports.destinationMetar,
    assessment_destination_taf: weatherReports.destinationTaf,
    route_departure: routeDeparture,
    route_destination: routeDestination,
    departure_metar: weatherReports.departureMetar,
    departure_taf: weatherReports.departureTaf,
    destination_metar: weatherReports.destinationMetar,
    destination_taf: weatherReports.destinationTaf,
    weather_source: weatherSource,
    weather_trigger_summary: weatherTriggerSummary,
    weather_advisories_summary: weatherAdvisoriesSummary,
    assessment_context_probe: 'COMPASS_CONTEXT_ACTIVE'
  };
}

function buildSilentAssessmentContextMessage(context) {
  const assessmentContext = normalizeAssessmentContext(context);
  const assessmentContextPayload = buildAssessmentContextPayload('result-discussion', assessmentContext);

  if (!assessmentContextPayload) {
    return '';
  }

  const fieldNames = [
    'assessment_id',
    'assessment_recommendation',
    'assessment_total_score',
    'assessment_top_factors',
    'route_departure',
    'route_destination',
    'departure_metar',
    'departure_taf',
    'destination_metar',
    'destination_taf',
    'weather_source',
    'weather_trigger_summary',
    'weather_advisories_summary'
  ];
  const contextLines = fieldNames
    .map((fieldName) => {
      const value = formatSilentContextValue(assessmentContextPayload[fieldName]);
      return value ? `${fieldName}: ${value}` : null;
    })
    .filter(Boolean);

  if (contextLines.length === 0) {
    return '';
  }

  return [
    '[APP_CONTEXT]',
    "This is hidden app context from the Pilot Go/No-Go DSS. Do not reply to this message. Wait for the user's next visible question.",
    ...contextLines,
    '[/APP_CONTEXT]'
  ].join('\n');
}

function logAssessmentContextDiagnostic(assessmentContextPayload, messageContext) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info('[orchestrate-chat] pre:send assessment context diagnostic', {
    assessmentPayloadExists: Boolean(assessmentContextPayload),
    assessment_id: assessmentContextPayload?.assessment_id || '',
    route_departure_present: Boolean(assessmentContextPayload?.route_departure),
    route_destination_present: Boolean(assessmentContextPayload?.route_destination),
    departure_metar_present: Boolean(assessmentContextPayload?.departure_metar),
    destination_taf_present: Boolean(assessmentContextPayload?.destination_taf),
    weather_trigger_summary_present: Boolean(assessmentContextPayload?.weather_trigger_summary),
    weather_advisories_summary_present: Boolean(
      assessmentContextPayload?.weather_advisories_summary
    ),
    nested_assessment_context_present: Object.prototype.hasOwnProperty.call(
      messageContext || {},
      'assessment_context'
    ),
    probe_attached:
      messageContext?.assessment_context_probe === 'COMPASS_CONTEXT_ACTIVE',
    context_keys: Object.keys(messageContext || {}).sort()
  });
}

function getAssessmentWeatherReports(assessmentContext) {
  return {
    departureMetar:
      normalizeWeatherReport(assessmentContext.weather?.departureMetar) ||
      normalizeWeatherReport(assessmentContext.weather?.dataUsed?.departure?.metar) ||
      normalizeWeatherReport(assessmentContext.weather?.metarTafSnippets?.departureMetar),
    departureTaf:
      normalizeWeatherReport(assessmentContext.weather?.departureTaf) ||
      normalizeWeatherReport(assessmentContext.weather?.dataUsed?.departure?.taf) ||
      normalizeWeatherReport(assessmentContext.weather?.metarTafSnippets?.departureTaf),
    destinationMetar:
      normalizeWeatherReport(assessmentContext.weather?.destinationMetar) ||
      normalizeWeatherReport(assessmentContext.weather?.dataUsed?.destination?.metar) ||
      normalizeWeatherReport(assessmentContext.weather?.metarTafSnippets?.destinationMetar),
    destinationTaf:
      normalizeWeatherReport(assessmentContext.weather?.destinationTaf) ||
      normalizeWeatherReport(assessmentContext.weather?.dataUsed?.destination?.taf) ||
      normalizeWeatherReport(assessmentContext.weather?.metarTafSnippets?.destinationTaf)
  };
}

function buildWeatherTriggerSummary(assessmentContext) {
  const triggers = assessmentContext.weather?.triggers;

  if (!Array.isArray(triggers) || triggers.length === 0) {
    return '';
  }

  return triggers
    .map((trigger) => {
      const label = normalizeSummaryPart(trigger?.label);
      const level = normalizeSummaryPart(trigger?.level);
      const summary = normalizeSummaryPart(trigger?.summary);

      if (!label) {
        return null;
      }

      const status = [level, summary].filter(Boolean).join(' - ');
      return status ? `${label}: ${status}` : label;
    })
    .filter(Boolean)
    .join('; ');
}

function buildWeatherAdvisoriesSummary(assessmentContext) {
  const advisories = assessmentContext.weather?.advisoriesNotices;

  if (!Array.isArray(advisories) || advisories.length === 0) {
    return '';
  }

  return advisories
    .map((advisory) => {
      const source = normalizeSummaryPart(advisory?.source);
      const title = normalizeSummaryPart(advisory?.title);
      const impact = normalizeSummaryPart(advisory?.impact);
      const altitude = normalizeSummaryPart(advisory?.altitudeDisplay);
      const summary = normalizeSummaryPart(advisory?.summary);
      const heading = [source, title].filter(Boolean).join(' ');
      const details = [impact, altitude, summary].filter(Boolean).join(', ');

      return [heading, details].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join('; ');
}

function normalizeSummaryPart(value) {
  return typeof value === 'string' ? value.trim() : stringifyContextValue(value).trim();
}

function formatFactorsForContext(factors) {
  if (!Array.isArray(factors)) {
    return [];
  }

  return factors.map((factor) => ({
    id: factor.id ?? '',
    category: factor.category ?? '',
    label: typeof factor === 'string' ? factor : factor.label ?? '',
    weight: factor.weight ?? '',
    advisoryOnly: Boolean(factor.advisoryOnly),
    autoSelected: Boolean(factor.autoSelected)
  }));
}

function normalizeAssessmentContext(resultContext) {
  if (!resultContext) {
    return null;
  }

  if (resultContext.result) {
    return resultContext;
  }

  return {
    result: resultContext
  };
}

function stringifyContextValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function formatSilentContextValue(value) {
  return stringifyContextValue(value).replace(/\s+/g, ' ').trim();
}

function normalizeWeatherReport(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasSilentAssessmentContextBeenSent(assessmentId) {
  if (!assessmentId || typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }

  return window.sessionStorage.getItem(getSilentAssessmentContextSentKey(assessmentId)) === 'true';
}

function markSilentAssessmentContextSent(assessmentId) {
  if (!assessmentId || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  window.sessionStorage.setItem(getSilentAssessmentContextSentKey(assessmentId), 'true');
}

function getSilentAssessmentContextSentKey(assessmentId) {
  return `${SILENT_ASSESSMENT_CONTEXT_SENT_KEY_PREFIX}${assessmentId}`;
}

function loadOrchestrateScript() {
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  const existingScript = document.getElementById(ORCHESTRATE_SCRIPT_ID);

  if (existingScript) {
    scriptLoadPromise = window.wxoLoader?.init
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existingScript.addEventListener('load', resolve, { once: true });
          existingScript.addEventListener('error', reject, { once: true });
        });

    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = ORCHESTRATE_SCRIPT_ID;
    script.src = `${orchestrateConfiguration.hostURL}/wxochat/wxoLoader.js?embed=true`;
    script.async = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export default OrchestrateChatEmbed;
