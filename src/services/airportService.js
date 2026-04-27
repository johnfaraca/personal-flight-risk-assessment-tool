export async function fetchAirportLookup({ departureAirport, destinationAirport }) {
  const proxyOrigin = (window.location.origin || 'http://localhost:5173').trim();
  const endpoint = new URL('/api/airport-lookup', proxyOrigin);

  endpoint.search = new URLSearchParams({
    departureAirport,
    destinationAirport
  }).toString();

  const response = await fetch(endpoint.toString());

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || 'Airport lookup request failed.');
    error.code = 'airport_lookup_request_failed';
    throw error;
  }

  return response.json();
}
