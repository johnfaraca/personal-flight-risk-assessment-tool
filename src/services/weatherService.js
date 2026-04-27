import {
  createUnavailableWeatherPicture,
  createWeatherPicture
} from './weatherModel.js';

export async function fetchWeatherPicture(flightSetup) {
  const configuredProxyOrigin =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_WEATHER_PROXY_ORIGIN || ''
      : '';
  const browserOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const proxyOrigin = (configuredProxyOrigin || browserOrigin).trim();
  const endpoint = new URL('/api/weather-picture', proxyOrigin);
  const params = new URLSearchParams({
    departureAirport: flightSetup.departureAirport,
    destinationAirport: flightSetup.destinationAirport,
    plannedDepartureTime: flightSetup.plannedDepartureTime,
    cruiseAltitude: String(flightSetup.cruiseAltitude),
    cruiseSpeed: String(flightSetup.cruiseSpeed)
  });
  endpoint.search = params.toString();

  console.info('[weather] requesting local proxy', {
    endpoint: endpoint.toString(),
    origin: window.location.origin
  });

  let response;

  try {
    response = await fetch(endpoint.toString());
  } catch (error) {
    console.error('[weather] proxy request failed before response', error);
    throw createWeatherClientError(
      'proxy_not_running',
      `Local weather proxy did not respond at ${endpoint.origin}. Start the local proxy with npm run dev.`
    );
  }

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    let errorPayload = null;
    let errorText = '';

    if (contentType.includes('application/json')) {
      errorPayload = await response.json();
    } else {
      errorText = await response.text();
    }

    throw classifyProxyError({
      endpoint,
      response,
      errorPayload,
      errorText
    });
  }

  if (!contentType.includes('application/json')) {
    throw createWeatherClientError(
      'wrong_frontend_url',
      `Frontend is not receiving JSON from ${endpoint.toString()}. Check that the app is running through the local proxy on port 5173.`
    );
  }

  const payload = await response.json();

  if (!payload?.apiHook || !payload?.departure || !payload?.destination) {
    throw createWeatherClientError(
      'faa_mapping_issue',
      'Local proxy returned an incomplete FAA weather payload. Check the FAA mapping layer.'
    );
  }

  console.info('[weather] proxy request succeeded', {
    endpoint: endpoint.toString(),
    status: response.status,
    weatherStatus: payload.apiHook.status
  });

  return payload;
}

export function getDemoWeatherPicture(flightSetup, flightPlan, apiNote) {
  return createWeatherPicture({
    flightSetup,
    flightPlan,
    apiStatus: 'demo',
    apiNote:
      apiNote ??
      'Weather context loaded.'
  });
}

export function getUnavailableWeatherPicture(flightSetup, flightPlan, apiNote) {
  return createUnavailableWeatherPicture({
    flightSetup,
    flightPlan,
    apiStatus: 'unavailable',
    apiNote:
      apiNote ??
      'Live weather has not loaded yet. Complete the flight setup to request weather.'
  });
}

function classifyProxyError({ endpoint, response, errorPayload, errorText }) {
  if (response.status === 404) {
    return createWeatherClientError(
      'wrong_frontend_url',
      `Frontend requested ${endpoint.toString()} but received 404. Verify the frontend is calling the local proxy on port 5173.`
    );
  }

  if (errorPayload?.code === 'faa_mapping_issue') {
    return createWeatherClientError(
      'faa_mapping_issue',
      errorPayload.message || 'FAA weather mapping failed in the local proxy.',
      errorPayload
    );
  }

  return createWeatherClientError(
    'bad_proxy_response',
    errorPayload?.message || errorText || `Local weather proxy returned HTTP ${response.status}.`,
    errorPayload || { status: response.status }
  );
}

function createWeatherClientError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
