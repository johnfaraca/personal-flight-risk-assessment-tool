import { useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard';
import StatGrid from '../components/StatGrid';
import { OFFICIAL_WEATHER_GUIDANCE } from '../data/weatherGuidance';
import { useAppContext } from '../state/AppContext';

function WeatherPictureScreen() {
  const navigate = useNavigate();
  const {
    flightPlan,
    flightSetup,
    weatherPicture,
    weatherStatus,
    weatherError,
    weatherReady
  } = useAppContext();
  const departureName =
    weatherPicture.departure.airportName ??
    flightPlan.departure?.name ??
    'Departure airport';
  const destinationName =
    weatherPicture.destination.airportName ??
    flightPlan.destination?.name ??
    'Destination airport';
  const weatherDataLabel =
    weatherPicture.apiHook.status === 'live'
      ? 'FAA AWC'
      : weatherPicture.apiHook.status === 'demo'
        ? 'Weather loaded'
        : 'Unavailable';
  const displayedHazards = weatherPicture.hazards.display ?? weatherPicture.hazards;
  const showEnrouteWorkload = Boolean(displayedHazards.interpretation);
  const advisoryItems = weatherPicture.advisories?.items ?? [];
  const hasRouteRelevantAdvisoryItems = advisoryItems.length > 0;
  const advisoryDebug = buildAdvisoryDebugSummary({
    weatherPicture,
    weatherStatus,
    weatherError,
    advisoryItems
  });

  return (
    <div className="screen-grid">
      <SectionCard
        title="Weather Picture"
        subtitle="Review a departure-to-arrival weather snapshot based on the current flight inputs."
        actions={
          <button
            className="primary-button"
            onClick={() => navigate('/pave-assessment')}
            disabled={!weatherReady}
          >
            Continue to PAVE Assessment
          </button>
        }
      >
        <StatGrid
          items={[
            {
              label: 'Departure',
              value: `${departureName} (${flightPlan.departureAirport})`
            },
            {
              label: 'Destination',
              value: `${destinationName} (${flightPlan.destinationAirport})`
            },
            { label: 'Planned departure', value: flightPlan.formattedDepartureTime },
            { label: 'Estimated arrival', value: weatherPicture.estimatedArrivalTime },
            {
              label: 'Cruise profile',
              value:
                flightPlan.cruiseSpeed !== null
                  ? `${Number(flightSetup.cruiseAltitude).toLocaleString()} ft at ${flightPlan.cruiseSpeed} kt`
                  : 'Enter altitude and speed'
            },
            { label: 'Estimated route distance', value: flightPlan.routeDistanceDisplay },
            { label: 'Weather data', value: weatherDataLabel }
          ]}
        />
        <div className="notice">{weatherPicture.apiHook.note}</div>
        {weatherStatus === 'loading' ? (
          <div className="notice">Refreshing weather from the FAA AWC service layer.</div>
        ) : null}
        {weatherStatus === 'error' ? (
          <div className="notice">
            Live weather could not be loaded. Review the trip inputs and try the
            weather request again.
          </div>
        ) : null}
        {weatherError ? (
          <div className="notice">
            Failure classification: {weatherError.code}. {weatherError.message}
          </div>
        ) : null}
      </SectionCard>

      {!weatherReady ? (
        <SectionCard title="Weather Status">
          <p>
            Live weather is required for the default flow. This screen will remain
            in a clear unavailable state until the FAA AWC request succeeds or you
            update the flight inputs.
          </p>
          {weatherError ? (
            <p>
              Diagnostic details: {weatherError.details ? JSON.stringify(weatherError.details) : 'None'}
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      <div className="weather-grid">
        <SectionCard title="Departure Weather Summary">
          <StationSummary
            station={weatherPicture.departure}
            airportCode={flightPlan.departureAirport}
            airportName={departureName}
          />
        </SectionCard>
        <SectionCard title="Estimated Arrival Time">
          <div className="arrival-card">
            <span className="eyebrow">Arrival estimate</span>
            <strong>{weatherPicture.estimatedArrivalTime}</strong>
            <p>
              Based on the current route-distance estimate, cruise speed, and the
              automatic 30-minute operational buffer from Flight Setup.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Destination Weather Summary">
          <StationSummary
            station={weatherPicture.destination}
            airportCode={flightPlan.destinationAirport}
            airportName={destinationName}
          />
        </SectionCard>
        <SectionCard title="Enroute Hazard Summary">
          <div className="hazard-list">
            <HazardItem
              label="Convection"
              level={displayedHazards.convection.level}
              summary={displayedHazards.convection.summary}
            />
            {showEnrouteWorkload ? (
              <HazardItem
                label="Route interpretation"
                level={displayedHazards.interpretation?.level ?? 'None'}
                summary={displayedHazards.interpretation?.summary ?? weatherPicture.hazards.enrouteWorkload.summary}
              />
            ) : null}
            <HazardItem
              label="Icing at planned altitude"
              level={displayedHazards.icing.level}
              summary={displayedHazards.icing.summary}
            />
            <HazardItem
              label="Precipitation / visibility concern"
              level={displayedHazards.precipitationVisibility.level}
              summary={displayedHazards.precipitationVisibility.summary}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Advisories and Notices">
        <p>
          Route-relevant advisories are listed here. Clean matches to existing
          risk factors may be auto-selected; all other items remain advisory-only.
        </p>
        <div className="notice">
          Sources: G-AIRMET {weatherPicture.advisories?.sources?.gairmet ?? 'unavailable'} | SIGMET{' '}
          {weatherPicture.advisories?.sources?.airsigmet ?? 'unavailable'} | NOTAMs{' '}
          {weatherPicture.advisories?.sources?.notams ?? 'unavailable'}
        </div>
        {weatherPicture.advisories?.note ? (
          <div className="notice">{weatherPicture.advisories.note}</div>
        ) : null}
        {hasRouteRelevantAdvisoryItems ? (
          <div className="hazard-list">
            {advisoryItems.map((item) => (
              <AdvisoryItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p>No route-relevant advisories or notices are currently mapped for this flight.</p>
        )}
        <AdvisoryDebugPanel debug={advisoryDebug} />
        <div className="official-weather-guidance">{OFFICIAL_WEATHER_GUIDANCE}</div>
      </SectionCard>
    </div>
  );
}

function AdvisoryDebugPanel({ debug }) {
  return (
    <div className="debug-panel">
      <span className="eyebrow">Temporary advisory debug</span>
      <dl className="debug-grid">
        <div>
          <dt>Fetch status</dt>
          <dd>{debug.fetchedSuccessfully ? 'Fetched successfully' : 'Not fetched / unavailable'}</dd>
        </div>
        <div>
          <dt>Data mode</dt>
          <dd>{debug.dataMode}</dd>
        </div>
        <div>
          <dt>Source used</dt>
          <dd>{debug.sourceUsed}</dd>
        </div>
        <div>
          <dt>Raw advisories returned</dt>
          <dd>{debug.rawAdvisoryCount}</dd>
        </div>
        <div>
          <dt>Mapped route-relevant advisories</dt>
          <dd>{debug.mappedRouteRelevantCount}</dd>
        </div>
        <div>
          <dt>Fetch/API error</dt>
          <dd>{debug.fetchErrorMessage || 'None reported'}</dd>
        </div>
        <div>
          <dt>AWC / NOTAM sources</dt>
          <dd>
            G-AIRMET {debug.rawCounts.gairmet}, SIGMET/AIRMET {debug.rawCounts.airsigmet},
            NOTAM {debug.rawCounts.notams}
          </dd>
        </div>
        <div>
          <dt>Proxy configuration</dt>
          <dd>{debug.proxyConfiguration}</dd>
        </div>
      </dl>
      <p>
        Production check: the browser requests <code>/api/weather-picture</code> on the current
        origin unless <code>VITE_WEATHER_PROXY_ORIGIN</code> is set. The FAA AWC and NOTAM base
        URLs are server-side constants, not Vite variables. A missing deployed API route, missing
        proxy origin, or CORS/network failure can prevent live advisories from loading.
      </p>
      {debug.mappingDiagnostics ? (
        <div className="mapping-debug">
          <h3>Mapping diagnostics</h3>
          <dl className="debug-grid">
            <div>
              <dt>Flight inputs</dt>
              <dd>
                {debug.mappingDiagnostics.flightInputs.departureIcao} to{' '}
                {debug.mappingDiagnostics.flightInputs.destinationIcao},{' '}
                {debug.mappingDiagnostics.flightInputs.cruiseAltitude} ft
              </dd>
            </div>
            <div>
              <dt>Times</dt>
              <dd>
                Depart {debug.mappingDiagnostics.flightInputs.plannedDepartureTime || 'unknown'}; ETA{' '}
                {debug.mappingDiagnostics.flightInputs.estimatedArrivalTime || 'unknown'}
              </dd>
            </div>
            <div>
              <dt>Departure lat/lon</dt>
              <dd>{debug.mappingDiagnostics.flightInputs.departureLatLon}</dd>
            </div>
            <div>
              <dt>Destination lat/lon</dt>
              <dd>{debug.mappingDiagnostics.flightInputs.destinationLatLon}</dd>
            </div>
            <div>
              <dt>Raw advisory summary</dt>
              <dd>
                ZULU {debug.mappingDiagnostics.rawSummary.zulu}, TANGO{' '}
                {debug.mappingDiagnostics.rawSummary.tango}, SIERRA{' '}
                {debug.mappingDiagnostics.rawSummary.sierra}, SIGMET/AIRMET{' '}
                {debug.mappingDiagnostics.rawSummary.sigmetAirmet}, NOTAM{' '}
                {debug.mappingDiagnostics.rawSummary.notams}
              </dd>
            </div>
            <div>
              <dt>Mapping result</dt>
              <dd>
                Raw {debug.rawAdvisoryCount}; candidates before final filtering{' '}
                {debug.mappingDiagnostics.candidateRouteRelevantCount}; final mapped{' '}
                {debug.mappingDiagnostics.finalMappedCount}
              </dd>
            </div>
          </dl>
          <div className="debug-reasons">
            <strong>Exclusion reasons</strong>
            {Object.entries(debug.mappingDiagnostics.exclusionReasons).length ? (
              <ul>
                {Object.entries(debug.mappingDiagnostics.exclusionReasons).map(([reason, count]) => (
                  <li key={reason}>
                    {count}: {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None reported.</p>
            )}
          </div>
          <div className="candidate-debug-list">
            {debug.mappingDiagnostics.candidates.map((candidate) => (
              <details key={candidate.id}>
                <summary>
                  {candidate.productType} / {candidate.hazardType}: {candidate.finalFilterReason}
                </summary>
                <dl className="debug-grid">
                  <div>
                    <dt>Valid window</dt>
                    <dd>{candidate.validWindow}</dd>
                  </div>
                  <div>
                    <dt>Altitude fields</dt>
                    <dd>{formatDebugObject(candidate.altitudeFields)}</dd>
                  </div>
                  <div>
                    <dt>Route overlap</dt>
                    <dd>{candidate.intersectsOrNearRoute ? 'yes' : 'no'}</dd>
                  </div>
                  <div>
                    <dt>Distance from route</dt>
                    <dd>
                      {candidate.distanceFromRouteNm === null
                        ? 'not calculated'
                        : `${candidate.distanceFromRouteNm} NM`}
                    </dd>
                  </div>
                  <div>
                    <dt>Time overlap</dt>
                    <dd>{candidate.timeOverlap ? 'yes' : 'no'}</dd>
                  </div>
                  <div>
                    <dt>Altitude overlap</dt>
                    <dd>{candidate.altitudeOverlap ? 'yes' : 'no'}</dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildAdvisoryDebugSummary({ weatherPicture, weatherStatus, weatherError, advisoryItems }) {
  const debug = weatherPicture.advisories?.debug ?? {};
  const clientDebug = debug.client ?? weatherError?.details?.client ?? weatherError?.details ?? {};
  const rawCounts = debug.rawCounts ?? {
    gairmet: 0,
    airsigmet: 0,
    notams: 0,
    total: 0
  };
  const viteProxyOrigin =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_WEATHER_PROXY_ORIGIN || ''
      : '';
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const selectedProxyOrigin = clientDebug.selectedProxyOrigin ?? (viteProxyOrigin || browserOrigin);

  return {
    fetchedSuccessfully:
      debug.fetchedSuccessfully ?? (weatherPicture.apiHook?.status === 'live' && !weatherError),
    dataMode: debug.dataMode ?? weatherPicture.apiHook?.status ?? weatherStatus ?? 'unknown',
    sourceUsed: debug.sourceUsed ?? weatherPicture.weatherDataUsed?.sourceLabel ?? 'Unknown',
    fetchErrorMessage:
      debug.fetchErrorMessage ?? weatherError?.message ?? weatherError?.details?.message ?? '',
    rawAdvisoryCount: debug.rawAdvisoryCount ?? rawCounts.total ?? 0,
    rawCounts,
    mappedRouteRelevantCount: debug.mappedRouteRelevantCount ?? advisoryItems.length,
    mappingDiagnostics: debug.mappingDiagnostics ?? null,
    proxyConfiguration: `VITE_WEATHER_PROXY_ORIGIN ${
      viteProxyOrigin || 'not set'
    }; browser origin ${browserOrigin}; selected proxy origin ${selectedProxyOrigin}`
  };
}

function formatDebugObject(value) {
  const entries = Object.entries(value ?? {});

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([key, entry]) => `${key}: ${entry}`).join(', ');
}

function StationSummary({ station, airportCode, airportName }) {
  return (
    <div className="station-summary">
      <div className="station-heading">
        <strong>{airportName}</strong>
        <span>{airportCode}</span>
      </div>
      <div className="station-metrics">
        <div className="station-metric">
          <span>Ceiling</span>
          <strong>{station.ceiling}</strong>
        </div>
        <div className="station-metric">
          <span>Visibility</span>
          <strong>{station.visibility}</strong>
        </div>
        <div className="station-metric">
          <span>Wind</span>
          <strong>{station.wind}</strong>
        </div>
      </div>
      <div className="station-code-block">{station.summary}</div>
    </div>
  );
}

function HazardItem({ label, level, summary }) {
  return (
    <div className="hazard-item">
      <div className="hazard-header">
        <strong>{label}</strong>
        <span className={`severity-badge severity-${level.toLowerCase()}`}>{level}</span>
      </div>
      <p>{summary}</p>
    </div>
  );
}

function AdvisoryItem({ item }) {
  const badgeLabel =
    item.impact === 'scoreable'
      ? 'Scoreable'
      : item.impact === 'suppresses'
        ? 'Suppresses factor'
        : 'Advisory only';

  return (
    <div className="hazard-item">
      <div className="hazard-header">
        <strong>{formatAdvisoryDisplayTitle(item)}</strong>
        <span className="severity-badge severity-none">{badgeLabel}</span>
      </div>
      <p>{item.summary}</p>
      {item.altitudeDisplay ? (
        <p className="advisory-altitude">Advisory altitude: {item.altitudeDisplay}</p>
      ) : null}
      {item.mappedFactorLabels?.length ? (
        <p>Mapped factors: {item.mappedFactorLabels.join('; ')}</p>
      ) : null}
      {item.impact === 'advisory-only' && !item.mappedFactorLabels?.length ? (
        <p>Impact: Advisory-only. No scored risk factor was auto-selected for this item.</p>
      ) : null}
      {item.advisoryOnlyReason ? <p>{item.advisoryOnlyReason}</p> : null}
      {item.rawText ? <div className="station-code-block">{item.rawText}</div> : null}
    </div>
  );
}

function formatAdvisoryDisplayTitle(item) {
  return item.title === 'AIRMET Zulu: Freezing Level'
    ? item.title
    : `${item.title} (${item.source})`;
}

export default WeatherPictureScreen;
