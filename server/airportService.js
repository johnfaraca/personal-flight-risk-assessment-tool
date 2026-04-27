import { fetchAirportRecords } from './awcClient.js';

export async function lookupAirports({ departureAirport, destinationAirport }) {
  const normalizedDepartureAirport = normalizeAirportCode(departureAirport);
  const normalizedDestinationAirport = normalizeAirportCode(destinationAirport);
  const ids = [
    ...new Set([normalizedDepartureAirport, normalizedDestinationAirport].filter(Boolean))
  ];

  if (ids.length === 0) {
    return {
      departureAirport: normalizedDepartureAirport,
      destinationAirport: normalizedDestinationAirport,
      departure: null,
      destination: null,
      error: null
    };
  }

  const airportRecords = await fetchAirportRecords(ids);
  const airportRecordsById = Object.fromEntries(
    airportRecords.map((record) => [normalizeAirportCode(record.icaoId), toAirport(record)])
  );
  const departure = airportRecordsById[normalizedDepartureAirport] ?? null;
  const destination = airportRecordsById[normalizedDestinationAirport] ?? null;
  const missingIds = [
    departure ? null : normalizedDepartureAirport,
    destination ? null : normalizedDestinationAirport
  ].filter(Boolean);

  return {
    departureAirport: normalizedDepartureAirport,
    destinationAirport: normalizedDestinationAirport,
    departure,
    destination,
    error:
      missingIds.length > 0
        ? {
            code: 'airport_lookup_failed',
            message: `Airport lookup failed for ${missingIds.join(' and ')}.`,
            missingIds
          }
        : null
  };
}

function toAirport(record) {
  return {
    icaoId: normalizeAirportCode(record.icaoId),
    lat: Number(record.lat),
    lon: Number(record.lon),
    name: String(record.name || record.icaoId || '').trim()
  };
}

function normalizeAirportCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}
