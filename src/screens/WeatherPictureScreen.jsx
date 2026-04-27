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
  const advisoryStatusMessage = getAdvisoryStatusMessage({ weatherPicture, advisoryItems });

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
        <div className="notice">{advisoryStatusMessage}</div>
        {hasRouteRelevantAdvisoryItems ? (
          <div className="hazard-list">
            {advisoryItems.map((item) => (
              <AdvisoryItem key={item.id} item={item} />
            ))}
          </div>
        ) : null}
        <div className="official-weather-guidance">{OFFICIAL_WEATHER_GUIDANCE}</div>
      </SectionCard>
    </div>
  );
}

function getAdvisoryStatusMessage({ weatherPicture, advisoryItems }) {
  const debug = weatherPicture.advisories?.debug ?? {};
  const rawAdvisoryCount = debug.rawAdvisoryCount ?? debug.rawCounts?.total ?? 0;

  if (advisoryItems.length > 0) {
    return `${advisoryItems.length} route-relevant advisories or notices are mapped for this flight.`;
  }

  if (weatherPicture.apiHook?.status !== 'live' || debug.fetchedSuccessfully === false) {
    return 'Live advisories and notices were not fetched for this weather picture.';
  }

  if (rawAdvisoryCount > 0) {
    return `${rawAdvisoryCount} regional advisories or notices were returned, but none are currently route-relevant for this flight.`;
  }

  return 'No live advisories or notices were returned for this flight.';
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
