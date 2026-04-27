const AWC_BASE_URL = 'https://aviationweather.gov/api/data';
const CACHE_BY_ENDPOINT = new Map();
const CACHE_TTLS = {
  airsigmet: 5 * 60 * 1000,
  airport: 24 * 60 * 60 * 1000,
  gairmet: 10 * 60 * 1000,
  metar: 60 * 1000,
  stationinfo: 24 * 60 * 60 * 1000,
  taf: 10 * 60 * 1000
};

export async function fetchAviationWeatherBundle({ departureAirport, destinationAirport }) {
  const ids = [...new Set([departureAirport, destinationAirport].map(normalizeAirportCode))].filter(Boolean);

  if (ids.length === 0) {
    return {
      departure: {},
      destination: {}
    };
  }

  const [metars, tafs, stationInfo, airportInfo, gairmets, airsigmets] = await Promise.all([
    fetchEndpoint('metar', ids),
    fetchEndpoint('taf', ids),
    fetchEndpoint('stationinfo', ids),
    fetchEndpoint('airport', ids),
    fetchEndpoint('gairmet'),
    fetchEndpoint('airsigmet')
  ]);

  const metarsById = indexByIcao(metars);
  const tafsById = indexByIcao(tafs);
  const stationInfoById = indexByIcao(stationInfo);
  const airportInfoById = indexByIcao(airportInfo);

  return {
    departure: {
      metar: metarsById[normalizeAirportCode(departureAirport)] ?? null,
      taf: tafsById[normalizeAirportCode(departureAirport)] ?? null,
      stationInfo: stationInfoById[normalizeAirportCode(departureAirport)] ?? null,
      airportInfo: airportInfoById[normalizeAirportCode(departureAirport)] ?? null
    },
    destination: {
      metar: metarsById[normalizeAirportCode(destinationAirport)] ?? null,
      taf: tafsById[normalizeAirportCode(destinationAirport)] ?? null,
      stationInfo: stationInfoById[normalizeAirportCode(destinationAirport)] ?? null,
      airportInfo: airportInfoById[normalizeAirportCode(destinationAirport)] ?? null
    },
    advisories: {
      gairmet: Array.isArray(gairmets) ? gairmets : [],
      airsigmet: Array.isArray(airsigmets) ? airsigmets : []
    }
  };
}

export async function fetchAirportRecords(ids) {
  const normalizedIds = [...new Set(ids.map(normalizeAirportCode).filter(Boolean))];

  if (normalizedIds.length === 0) {
    return [];
  }

  return fetchEndpoint('airport', normalizedIds);
}

async function fetchEndpoint(endpoint, ids = []) {
  const normalizedIds = ids.map(normalizeAirportCode).filter(Boolean);
  const url = new URL(`${AWC_BASE_URL}/${endpoint}`);

  if (normalizedIds.length > 0) {
    url.searchParams.set('ids', normalizedIds.join(','));
  }

  url.searchParams.set('format', 'json');
  const cacheKey = url.toString();
  const cached = CACHE_BY_ENDPOINT.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let response;

  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'pilot-go-no-go-mvp/0.1 (server-side FAA AWC proxy)'
      }
    });
  } catch (error) {
    throw createServerWeatherError(
      'bad_proxy_response',
      `Unable to reach FAA AWC ${endpoint} endpoint.`,
      { endpoint, url: url.toString(), cause: error.message }
    );
  }

  if (response.status === 204) {
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw createServerWeatherError(
      'bad_proxy_response',
      `FAA AWC ${endpoint} request failed (${response.status}).`,
      { endpoint, url: url.toString(), status: response.status, body: errorText }
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw createServerWeatherError(
      'faa_mapping_issue',
      `FAA AWC ${endpoint} returned an unexpected payload shape.`,
      { endpoint, url: url.toString(), payloadType: typeof data }
    );
  }

  CACHE_BY_ENDPOINT.set(cacheKey, {
    data,
    expiresAt: Date.now() + (CACHE_TTLS[endpoint] ?? 60 * 1000)
  });

  return data;
}

function indexByIcao(items) {
  return Object.fromEntries(
    (items ?? [])
      .map((item) => [normalizeAirportCode(item.icaoId ?? item.id), item])
      .filter(([key]) => key)
  );
}

function normalizeAirportCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function createServerWeatherError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
