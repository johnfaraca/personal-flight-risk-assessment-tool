function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineNm(from, to) {
  const earthRadiusNm = 3440.065;
  const latDelta = toRadians(to.lat - from.lat);
  const lonDelta = toRadians(to.lon - from.lon);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(lonDelta / 2) ** 2;

  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addMinutes(dateString, minutes) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(minutes)) {
    return null;
  }

  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function formatLocalDateTime(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return 'Enter a valid departure time';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function normalizeAirportCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function calculateFlightPlan(flightSetup, resolvedAirports = {}, airportLookupError = null) {
  const departureAirport = normalizeAirportCode(flightSetup.departureAirport);
  const destinationAirport = normalizeAirportCode(flightSetup.destinationAirport);
  const departure = resolvedAirports.departure ?? null;
  const destination = resolvedAirports.destination ?? null;
  const hasAirportInputs = Boolean(departureAirport && destinationAirport);
  const routeDistanceNm =
    departure && destination
      ? Math.round(haversineNm(departure, destination) * 1.12)
      : null;
  const parsedCruiseSpeed = Number(flightSetup.cruiseSpeed);
  const safeCruiseSpeed = Number.isFinite(parsedCruiseSpeed) && parsedCruiseSpeed > 0
    ? parsedCruiseSpeed
    : null;
  const hasDepartureTime = Boolean(flightSetup.plannedDepartureTime);
  const cruiseTimeMinutes =
    routeDistanceNm !== null && safeCruiseSpeed !== null
      ? Math.max(20, Math.round((routeDistanceNm / safeCruiseSpeed) * 60))
      : null;
  const operationalBufferMinutes = 30;
  const estimatedArrivalTime = addMinutes(
    flightSetup.plannedDepartureTime,
    (cruiseTimeMinutes ?? Number.NaN) + operationalBufferMinutes
  );
  const hasRequiredFlightInputs = Boolean(
    departureAirport &&
    destinationAirport &&
    flightSetup.plannedDepartureTime &&
    departure &&
    destination &&
    flightSetup.cruiseSpeed !== '' &&
    flightSetup.cruiseSpeed !== null &&
    flightSetup.cruiseSpeed !== undefined
  );

  return {
    departure,
    departureAirport,
    destination,
    destinationAirport,
    cruiseSpeed: safeCruiseSpeed,
    routeDistanceNm,
    cruiseTimeMinutes,
    operationalBufferMinutes,
    estimatedArrivalTime,
    hasRequiredFlightInputs,
    hasKnownRoute: Boolean(departure && destination),
    formattedDepartureTime: formatLocalDateTime(flightSetup.plannedDepartureTime),
    formattedArrivalTime: estimatedArrivalTime
      ? formatLocalDateTime(estimatedArrivalTime)
      : 'Waiting for departure time',
    routeDistanceDisplay:
      routeDistanceNm !== null
        ? `${routeDistanceNm} NM`
        : airportLookupError
          ? airportLookupError
          : hasAirportInputs
            ? 'Waiting for airports'
          : 'Waiting for airports',
    cruiseTimeDisplay:
      cruiseTimeMinutes !== null
        ? `${cruiseTimeMinutes} min`
        : airportLookupError
          ? airportLookupError
          : hasAirportInputs
            ? 'Route/speed pending'
          : 'Route/speed pending',
    bufferDisplay:
      `${operationalBufferMinutes} min`
  };
}
