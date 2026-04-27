import { useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard';
import StatGrid from '../components/StatGrid';
import { useAppContext } from '../state/AppContext';

function FlightSetupScreen() {
  const navigate = useNavigate();
  const {
    flightPlan,
    flightSetup,
    setFlightSetup
  } = useAppContext();

  function updateField(key, value) {
    setFlightSetup((current) => ({
      ...current,
      [key]: value
    }));
  }

  function useSampleFlight() {
    const plannedDepartureTime = new Date(Date.now() + 60 * 60 * 1000)
      .toLocaleString('sv-SE')
      .slice(0, 16);

    setFlightSetup((current) => ({
      ...current,
      departureAirport: 'KFMY',
      destinationAirport: 'KDAB',
      plannedDepartureTime,
      cruiseAltitude: '7500',
      cruiseSpeed: '125'
    }));
  }

  return (
    <div className="screen-grid">
      <SectionCard
        title="Flight Setup"
        subtitle="Enter trip details, review estimated timing, then continue to the weather picture."
        actions={
          <div className="flight-setup-actions">
            <button
              className="secondary-button flight-sample-action"
              type="button"
              onClick={useSampleFlight}
            >
              Use sample flight
            </button>
            <button
              className="primary-button flight-continue-action"
              onClick={() => navigate('/weather-picture')}
            >
              Continue to Weather Picture
            </button>
          </div>
        }
      >
        <div className="flight-setup-layout">
          <div className="form-grid">
            <label>
              Departure airport
              <input
                value={flightSetup.departureAirport}
                onChange={(event) =>
                  updateField('departureAirport', event.target.value.toUpperCase())
                }
                maxLength={4}
                placeholder="Enter ICAO code, e.g., KFMY"
              />
            </label>
            <label>
              Destination airport
              <input
                value={flightSetup.destinationAirport}
                onChange={(event) =>
                  updateField('destinationAirport', event.target.value.toUpperCase())
                }
                maxLength={4}
                placeholder="Enter ICAO code, e.g., KDAB"
              />
            </label>
            <label>
              Planned departure time
              <input
                type="datetime-local"
                value={flightSetup.plannedDepartureTime}
                onChange={(event) => updateField('plannedDepartureTime', event.target.value)}
              />
            </label>
            <label>
              Cruise altitude
              <input
                type="number"
                value={flightSetup.cruiseAltitude}
                onChange={(event) => updateField('cruiseAltitude', event.target.value)}
                min="0"
                step="500"
                placeholder="Enter altitude, e.g., 7,500"
              />
              <span className="field-hint">Feet MSL</span>
            </label>
            <label>
              Cruise speed
              <input
                type="number"
                value={flightSetup.cruiseSpeed}
                onChange={(event) => updateField('cruiseSpeed', event.target.value)}
                min="0"
                step="1"
                placeholder="Enter speed in knots, e.g., 125"
              />
              <span className="field-hint">Knots</span>
            </label>
          </div>

          <aside className="flight-setup-aside">
            <div className="flight-setup-note">
              <p className="eyebrow">Advisory</p>
              <p>
                This prototype is decision-support only and does not replace official
                weather briefings, flight planning, performance calculations,
                regulations, or pilot judgment.
              </p>
            </div>
            <div className="flight-setup-note muted">
              <p className="eyebrow">Weather Readiness</p>
              <p>
                Weather Picture will request FAA AWC weather through the local
                service layer and show a clear unavailable state if that request
                cannot be completed.
              </p>
            </div>
          </aside>
        </div>
      </SectionCard>

      <SectionCard
        title="Estimated Timing"
        subtitle="Estimated from the current departure airport, destination airport, planned departure time, and cruise speed."
      >
        <StatGrid
          items={[
            { label: 'Estimated route distance', value: flightPlan.routeDistanceDisplay },
            { label: 'Estimated cruise time', value: flightPlan.cruiseTimeDisplay },
            { label: 'Automatic buffer', value: flightPlan.bufferDisplay },
            { label: 'Estimated arrival time', value: flightPlan.formattedArrivalTime }
          ]}
        />
      </SectionCard>
    </div>
  );
}

export default FlightSetupScreen;
