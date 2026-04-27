import { calculateFlightPlan } from '../src/utils/flight.js';
import { createWeatherPicture } from '../src/services/weatherModel.js';
import { fetchAviationWeatherBundle } from './awcClient.js';
import { lookupAirports } from './airportService.js';
import { fetchAirportNotams } from './notamClient.js';

export async function buildWeatherPictureFromFlightSetup(flightSetup) {
  const normalizedFlightSetup = normalizeFlightSetup(flightSetup);
  const airportLookup = await lookupAirports(normalizedFlightSetup);
  const flightPlan = calculateFlightPlan(
    normalizedFlightSetup,
    {
      departure: airportLookup.departure,
      destination: airportLookup.destination
    },
    airportLookup.error?.message ?? null
  );

  if (!flightPlan.hasRequiredFlightInputs) {
    const error = new Error(
      airportLookup.error?.message || 'Flight setup is incomplete.'
    );
    error.code = airportLookup.error?.code || 'bad_proxy_response';
    error.details = airportLookup.error?.missingIds
      ? { stage: 'airport_lookup', missingIds: airportLookup.error.missingIds }
      : { stage: 'validation' };
    throw error;
  }

  const awcData = await fetchAviationWeatherBundle(normalizedFlightSetup);
  const notams = await fetchAirportNotams(normalizedFlightSetup.destinationAirport);
  awcData.advisories = {
    ...(awcData.advisories ?? {}),
    notams
  };
  const weatherPicture = createWeatherPicture({
    flightSetup: normalizedFlightSetup,
    flightPlan,
    awcData,
    apiStatus: 'live',
    apiNote:
      'Weather data is loaded from the FAA Aviation Weather Center. Some factors use deterministic fallback mapping.'
  });

  if (!weatherPicture?.apiHook || !weatherPicture?.departure || !weatherPicture?.destination) {
    const error = new Error('Mapped weather picture is incomplete.');
    error.code = 'faa_mapping_issue';
    error.details = { stage: 'mapping' };
    throw error;
  }

  return weatherPicture;
}

function normalizeFlightSetup(flightSetup) {
  return {
    departureAirport: String(flightSetup.departureAirport ?? '').trim().toUpperCase(),
    destinationAirport: String(flightSetup.destinationAirport ?? '').trim().toUpperCase(),
    plannedDepartureTime: String(flightSetup.plannedDepartureTime ?? ''),
    cruiseAltitude: Number(flightSetup.cruiseAltitude) || 0,
    cruiseSpeed: Number(flightSetup.cruiseSpeed) || 0
  };
}
