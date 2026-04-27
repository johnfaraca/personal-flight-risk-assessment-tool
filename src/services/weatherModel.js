import { buildAssessmentMetadata } from '../engine/factors.js';
import {
  ADVISORY_ONLY_WEATHER_GUIDANCE,
  OFFICIAL_WEATHER_GUIDANCE
} from '../data/weatherGuidance.js';

const assessmentMetadata = buildAssessmentMetadata();

export function createWeatherPicture({
  flightSetup,
  flightPlan,
  awcData = null,
  apiStatus = 'fallback',
  apiNote = 'Weather shown here is generated from the current flight inputs.'
}) {
  const basePicture = buildGeneratedWeatherPicture(flightSetup, flightPlan);

  if (!awcData) {
    const advisoryDebug = buildAdvisoryDebug({
      apiStatus,
      dataMode: apiStatus === 'demo' ? 'mock' : 'fallback',
      fetchedSuccessfully: false,
      sourceUsed: 'Generated fallback weather',
      fetchErrorMessage: null,
      rawCounts: null,
      mappedCount: basePicture.advisories?.items?.length ?? 0
    });

    return finalizeWeatherPicture(basePicture, {
      apiStatus,
      apiNote,
      sourceFingerprint: apiStatus,
      advisoryDebug
    });
  }

  const departure = awcData.departure?.metar
    ? buildStationFromMetar(awcData.departure.metar, awcData.departure, basePicture.departure)
    : basePicture.departure;
  const destinationForecast = selectTafForecast(
    awcData.destination?.taf,
    flightPlan.estimatedArrivalTime
  );
  const destination = destinationForecast
    ? buildStationFromTaf(
        destinationForecast,
        awcData.destination?.taf,
        awcData.destination,
        basePicture.destination
      )
    : awcData.destination?.metar
      ? buildStationFromMetar(
          awcData.destination.metar,
          awcData.destination,
          basePicture.destination
        )
      : basePicture.destination;
  const hazards = buildLiveHazards({
    baseHazards: basePicture.hazards,
    departure,
    destination,
    destinationForecast,
    awcData,
    flightSetup,
    flightPlan
  });
  const advisoryAnalysis = buildLiveAdvisoryAnalysis({
    awcData,
    flightSetup,
    flightPlan
  });
  const suppressedFactorIds = new Set(advisoryAnalysis.suppressedFactorIds);
  const suggestedResponses = [
    ...new Set([
      ...basePicture.autoSelectedIds,
      ...deriveLiveSuggestedResponses({
        flightSetup,
        flightPlan,
        departure,
        destination,
        destinationForecast,
        hazards,
        awcData
      }),
      ...advisoryAnalysis.scoreableFactorIds
    ])
  ].filter((id) => !suppressedFactorIds.has(id));
  const departureSummary = buildStationSummary(departure);
  const destinationSummary = buildStationSummary(destination);

  return finalizeWeatherPicture(
    {
      ...basePicture,
      assessmentMetadata: hydrateMetadata(suggestedResponses),
      departure,
      destination,
      departureSummary,
      destinationSummary,
      weatherDataUsed: buildLiveWeatherDataUsed(awcData),
      hazards,
      advisories: advisoryAnalysis.display,
      autoSelectedIds: suggestedResponses,
      summary: `Departure: ${departureSummary} Destination: ${destinationSummary}`
    },
    {
      apiStatus,
      apiNote,
      sourceFingerprint: buildSourceFingerprint(awcData),
      advisoryDebug: advisoryAnalysis.debug
    }
  );
}

function finalizeWeatherPicture(basePicture, { apiStatus, apiNote, sourceFingerprint, advisoryDebug }) {
  return {
    assessmentMetadata: basePicture.assessmentMetadata,
    departure: basePicture.departure,
    destination: basePicture.destination,
    advisories: {
      ...basePicture.advisories,
      debug: advisoryDebug ?? basePicture.advisories?.debug ?? null
    },
    departureSummary: basePicture.departureSummary,
    destinationSummary: basePicture.destinationSummary,
    weatherDataUsed: basePicture.weatherDataUsed ?? buildUnavailableWeatherDataUsed(),
    hazards: {
      ...basePicture.hazards,
      visibility: basePicture.hazards.precipitationVisibility
    },
    estimatedArrivalTime: basePicture.estimatedArrivalTime,
    signature: [...basePicture.signatureParts, sourceFingerprint].join('|'),
    summary: basePicture.summary,
    apiHook: {
      status: apiStatus,
      note: apiNote
    }
  };
}

export function createUnavailableWeatherPicture({
  flightSetup,
  flightPlan,
  apiStatus = 'unavailable',
  apiNote = 'Live weather has not been loaded yet.',
  sourceFingerprint = 'unavailable'
}) {
  const emptyMetadata = hydrateMetadata([]);
  const departure = buildUnavailableStation(flightPlan.departure?.name ?? 'Departure airport');
  const destination = buildUnavailableStation(flightPlan.destination?.name ?? 'Destination airport');
  const hazards = buildUnavailableHazards();

  return {
    assessmentMetadata: emptyMetadata,
    departure,
    destination,
    advisories: buildUnavailableAdvisories(undefined, {
      apiStatus,
      dataMode: 'unavailable',
      fetchedSuccessfully: false,
      sourceUsed: 'No live advisory source',
      fetchErrorMessage: apiNote,
      rawCounts: null,
      mappedCount: 0
    }),
    departureSummary: 'Live departure weather unavailable.',
    destinationSummary: 'Live destination weather unavailable.',
    weatherDataUsed: buildUnavailableWeatherDataUsed(),
    hazards: {
      ...hazards,
      visibility: hazards.precipitationVisibility
    },
    estimatedArrivalTime: flightPlan.formattedArrivalTime,
    signature: [
      flightSetup.departureAirport,
      flightSetup.destinationAirport,
      flightSetup.plannedDepartureTime,
      flightSetup.cruiseAltitude,
      flightSetup.cruiseSpeed,
      sourceFingerprint
    ].join('|'),
    summary: 'Weather summary unavailable because live weather has not been loaded.',
    apiHook: {
      status: apiStatus,
      note: apiNote
    }
  };
}

function buildGeneratedWeatherPicture(flightSetup, flightPlan) {
  const departureAirportName = flightPlan.departure?.name ?? flightPlan.departureAirport ?? 'Departure airport';
  const destinationAirportName =
    flightPlan.destination?.name ?? flightPlan.destinationAirport ?? 'Destination airport';
  const weatherContext = buildWeatherContext(flightSetup, flightPlan);
  const departure = buildGeneratedStationWeather({
    airportCode: flightPlan.departureAirport,
    airportName: departureAirportName,
    phase: 'departure',
    weatherContext
  });
  const destination = buildGeneratedStationWeather({
    airportCode: flightPlan.destinationAirport,
    airportName: destinationAirportName,
    phase: 'destination',
    weatherContext
  });
  const hazards = buildGeneratedHazards(weatherContext, departure, destination);
  const suggestedResponses = deriveGeneratedSuggestedResponses({
    flightSetup,
    flightPlan,
    departure,
    destination,
    hazards
  });
  const departureSummary = buildStationSummary(departure);
  const destinationSummary = buildStationSummary(destination);
  const signatureParts = [
    flightSetup.departureAirport,
    flightSetup.destinationAirport,
    flightSetup.plannedDepartureTime,
    flightSetup.cruiseAltitude,
    flightSetup.cruiseSpeed
  ];

  return {
    assessmentMetadata: hydrateMetadata(suggestedResponses),
    departure,
    destination,
    advisories: buildUnavailableAdvisories(
      'Generated weather does not include live advisories, SIGMETs, AIRMETs, or NOTAMs.'
    ),
    departureSummary,
    destinationSummary,
    weatherDataUsed: {
      sourceLabel: 'Generated weather',
      departure: {
        metar: departure.summary,
        taf: ''
      },
      destination: {
        metar: '',
        taf: destination.summary
      }
    },
    hazards: {
      ...hazards,
      display: buildDisplayedGeneratedHazards()
    },
    estimatedArrivalTime: flightPlan.formattedArrivalTime,
    signatureParts,
    summary: `Departure: ${departureSummary} Destination: ${destinationSummary}`,
    autoSelectedIds: suggestedResponses
  };
}

function buildLiveWeatherDataUsed(awcData) {
  return {
    sourceLabel: 'FAA AWC',
    departure: {
      metar: getRawMetarText(awcData?.departure?.metar),
      taf: getRawTafText(awcData?.departure?.taf)
    },
    destination: {
      metar: getRawMetarText(awcData?.destination?.metar),
      taf: getRawTafText(awcData?.destination?.taf)
    }
  };
}

function buildUnavailableWeatherDataUsed() {
  return {
    sourceLabel: 'Unavailable',
    departure: {
      metar: '',
      taf: ''
    },
    destination: {
      metar: '',
      taf: ''
    }
  };
}

function buildStationSummary(station) {
  return `ceiling ${station.ceiling}, visibility ${station.visibility}, wind ${station.wind}. ${station.summary}`;
}

function buildUnavailableStation(airportName) {
  return {
    airportName,
    ceiling: 'Unavailable',
    ceilingFeet: null,
    visibility: 'Unavailable',
    visibilitySm: 10,
    wind: 'Unavailable',
    windDirection: null,
    windSpeed: 0,
    summary: 'Live weather unavailable.'
  };
}

function buildUnavailableHazards() {
  return {
    convection: {
      level: 'None',
      summary: 'Live weather is unavailable, so hazard synthesis has not been computed.'
    },
    icing: {
      level: 'None',
      summary: 'Live weather is unavailable, so hazard synthesis has not been computed.'
    },
    precipitationVisibility: {
      level: 'None',
      summary: 'Live weather is unavailable, so hazard synthesis has not been computed.'
    },
    display: buildDisplayedGeneratedHazards()
  };
}

function buildUnavailableAdvisories(
  note = 'Live advisories are unavailable for this weather picture.',
  debug = null
) {
  return {
    sources: {
      gairmet: 'unavailable',
      airsigmet: 'unavailable',
      notams: 'unavailable'
    },
    note,
    officialWeatherGuidance: OFFICIAL_WEATHER_GUIDANCE,
    debug:
      debug ??
      buildAdvisoryDebug({
        apiStatus: 'unavailable',
        dataMode: 'unavailable',
        fetchedSuccessfully: false,
        sourceUsed: 'No live advisory source',
        fetchErrorMessage: note,
        rawCounts: null,
        mappedCount: 0
      }),
    items: []
  };
}

function buildAdvisoryDebug({
  apiStatus,
  dataMode,
  fetchedSuccessfully,
  sourceUsed,
  fetchErrorMessage,
  rawCounts,
  mappedCount
}) {
  return {
    apiStatus,
    dataMode,
    fetchedSuccessfully,
    sourceUsed,
    fetchErrorMessage: fetchErrorMessage ?? null,
    rawAdvisoryCount: rawCounts?.total ?? 0,
    rawCounts: rawCounts ?? {
      gairmet: 0,
      airsigmet: 0,
      notams: 0,
      total: 0
    },
    mappedRouteRelevantCount: mappedCount ?? 0
  };
}

function buildDisplayedGeneratedHazards() {
  return {
    convection: {
      level: 'None',
      summary: 'No direct convective signal identified from current available forecast data.'
    },
    icing: {
      level: 'None',
      summary: 'Limited enroute interpretation from current route data.'
    },
    precipitationVisibility: {
      level: 'None',
      summary: 'Limited enroute interpretation from current route data.'
    },
    interpretation: {
      level: 'None',
      summary: 'Limited enroute interpretation from current route data.'
    }
  };
}

function buildWeatherContext(flightSetup, flightPlan) {
  const departureDate = new Date(flightSetup.plannedDepartureTime);
  const departureHour = Number.isNaN(departureDate.getTime())
    ? 12
    : departureDate.getHours();
  const arrivalDate = flightPlan.estimatedArrivalTime
    ? new Date(flightPlan.estimatedArrivalTime)
    : null;
  const arrivalHour =
    arrivalDate && !Number.isNaN(arrivalDate.getTime()) ? arrivalDate.getHours() : departureHour;
  const month = Number.isNaN(departureDate.getTime()) ? 6 : departureDate.getMonth();
  const routeDistanceNm = Number(flightPlan.routeDistanceNm) || 0;
  const cruiseAltitude = Number(flightSetup.cruiseAltitude) || 0;
  const cruiseSpeed = Number(flightSetup.cruiseSpeed) || 0;
  const seed = hashString(
    [
      flightPlan.departureAirport,
      flightPlan.destinationAirport,
      flightSetup.plannedDepartureTime,
      cruiseAltitude,
      cruiseSpeed,
      routeDistanceNm
    ].join('|')
  );

  return {
    departureHour,
    arrivalHour,
    month,
    routeDistanceNm,
    cruiseAltitude,
    cruiseSpeed,
    seed
  };
}

function buildGeneratedStationWeather({ airportCode, airportName, phase, weatherContext }) {
  const phaseOffset = phase === 'departure' ? 0 : 37;
  const localSeed = (weatherContext.seed + hashString(`${airportCode}|${phase}`) + phaseOffset) % 997;
  const activeHour =
    phase === 'departure' ? weatherContext.departureHour : weatherContext.arrivalHour;
  const afternoonBias = activeHour >= 13 && activeHour <= 18 ? 1 : 0;
  const nightBias = activeHour < 7 || activeHour >= 20 ? 1 : 0;
  const distanceBias = weatherContext.routeDistanceNm >= 180 ? 1 : 0;
  const altitudeBias = weatherContext.cruiseAltitude >= 9000 ? 1 : 0;
  const baseCeiling =
    8500 -
    afternoonBias * 1200 -
    distanceBias * 900 -
    nightBias * 700 -
    (localSeed % 7) * 450;
  const ceilingFeet = roundToNearest(Math.max(500, Math.min(12000, baseCeiling)), 500);
  const visibilityValue = clamp(
    10 - afternoonBias - distanceBias - (localSeed % 4) - nightBias,
    2,
    10
  );
  const windDirection = ((localSeed * 23) % 36) * 10;
  const windSpeed = clamp(
    6 + (localSeed % 10) + afternoonBias * 3 + altitudeBias * 2,
    4,
    24
  );
  const temperatureC = clamp(
    28 - Math.round(weatherContext.cruiseAltitude / 2000) - nightBias * 6 - (localSeed % 4),
    -5,
    32
  );
  const dewpointC = temperatureC - clamp(2 + (localSeed % 5) + nightBias, 2, 8);
  const cloudDescriptor =
    ceilingFeet <= 2500 ? 'Broken' : ceilingFeet <= 6000 ? 'Scattered' : 'Few';
  const stationCode = airportCode || airportName.slice(0, 4).toUpperCase();

  return {
    airportName,
    ceiling: `${cloudDescriptor} ${ceilingFeet.toLocaleString()} ft`,
    ceilingFeet,
    visibility: `${visibilityValue} SM`,
    visibilitySm: visibilityValue,
    wind: `${String(windDirection).padStart(3, '0')} at ${windSpeed} kt`,
    windDirection,
    windSpeed,
    summary: buildPseudoMetar({
      stationCode,
      activeHour,
      windDirection,
      windSpeed,
      visibilityValue,
      cloudDescriptor,
      ceilingFeet,
      temperatureC,
      dewpointC
    })
  };
}

function buildGeneratedHazards(weatherContext, departure, destination) {
  const convectiveScore =
    (weatherContext.departureHour >= 13 && weatherContext.departureHour <= 18 ? 1 : 0) +
    (weatherContext.routeDistanceNm >= 140 ? 1 : 0) +
    (destination.windSpeed >= 16 ? 1 : 0);
  const icingScore =
    (weatherContext.cruiseAltitude >= 10000 ? 1 : 0) +
    (weatherContext.month <= 2 || weatherContext.month >= 10 ? 1 : 0) +
    (destination.ceilingFeet <= 3000 ? 1 : 0);
  const visibilityScore =
    (Math.min(departure.visibilitySm, destination.visibilitySm) <= 5 ? 1 : 0) +
    (destination.ceilingFeet <= 3000 ? 1 : 0) +
    (weatherContext.arrivalHour < 7 || weatherContext.arrivalHour >= 20 ? 1 : 0);

  return {
    convection: {
      level: severityFromScore(convectiveScore),
      summary:
        convectiveScore >= 2
          ? 'Route timing and wind profile suggest building cells or convective turbulence could increase workload around the planned departure-to-arrival window.'
          : 'No major convective trigger stands out from the current route timing, though localized buildups remain possible in a live-weather version.'
    },
    icing: {
      level: severityFromScore(icingScore),
      summary:
        icingScore >= 2
          ? `Cruise altitude near ${weatherContext.cruiseAltitude.toLocaleString()} ft and the current timing suggest extra caution for colder cloud layers and icing exposure.`
          : `At the planned ${weatherContext.cruiseAltitude.toLocaleString()} ft cruise altitude, significant icing is not strongly indicated by this prototype input-driven model.`
    },
    precipitationVisibility: {
      level: severityFromScore(visibilityScore),
      summary:
        visibilityScore >= 2
          ? 'Ceiling, visibility, and arrival timing combine into a meaningful visibility-management concern on this trip profile.'
          : 'Only modest ceiling and visibility degradation is suggested by the current trip profile.'
    }
  };
}

function deriveGeneratedSuggestedResponses({
  flightSetup,
  flightPlan,
  departure,
  destination,
  hazards
}) {
  const suggestedResponses = new Set();
  const arrivalHour = flightPlan.estimatedArrivalTime
    ? new Date(flightPlan.estimatedArrivalTime).getHours()
    : new Date(flightSetup.plannedDepartureTime).getHours();

  if (hazards.icing.level === 'Moderate' || hazards.icing.level === 'High') {
    suggestedResponses.add(
      'environment-Icing forecast (AIRMET > light) at required altitude with de-icing equipment'
    );
  }

  if (hasFlightDurationOverThreeHours(flightPlan)) {
    suggestedResponses.add('pilot-Flight duration greater than 3 hours');
  }

  if (Number(flightSetup.cruiseAltitude) > 10000) {
    suggestedResponses.add('pilot-Day > 10,000 ft pressure altitude with no oxygen');
  }

  if ((arrivalHour < 7 || arrivalHour >= 20) && Number(flightSetup.cruiseAltitude) > 5000) {
    suggestedResponses.add('pilot-Night > 5,000 ft pressure altitude with no oxygen');
  }

  return [...suggestedResponses];
}

function buildStationFromMetar(metar, locationData, fallbackStation) {
  const clouds = Array.isArray(metar.clouds) ? metar.clouds : [];
  const ceilingFeet = determineCeilingFeet(clouds);
  const skyDescription = clouds.length > 0
    ? formatCloudLayers(clouds)
    : skyCoverLabel(metar.cover ?? 'CLR');
  const visibilitySm = parseVisibility(metar.visib);
  const airportName =
    normalizeAirportName(locationData.stationInfo?.site) ??
    normalizeAirportName(locationData.airportInfo?.name) ??
    fallbackStation.airportName;

  return {
    airportName,
    ceiling: skyDescription,
    ceilingFeet: ceilingFeet ?? fallbackStation.ceilingFeet,
    visibility: formatVisibility(metar.visib),
    visibilitySm,
    wind: formatWind(metar.wdir, metar.wspd),
    windDirection: normalizeWindDirection(metar.wdir),
    windSpeed: Number(metar.wspd) || 0,
    summary: getRawMetarText(metar) || fallbackStation.summary
  };
}

function buildStationFromTaf(forecast, taf, locationData, fallbackStation) {
  const ceilingFeet = determineCeilingFeet(forecast.clouds);
  const skyDescription = Array.isArray(forecast.clouds) && forecast.clouds.length > 0
    ? formatCloudLayers(forecast.clouds)
    : 'Forecast calls for clear or unrestricted sky'
  ;
  const visibilitySm = parseVisibility(forecast.visib);
  const airportName =
    normalizeAirportName(locationData.stationInfo?.site) ??
    normalizeAirportName(locationData.airportInfo?.name) ??
    fallbackStation.airportName;
  const wxString = forecast.wxString ? ` ${forecast.wxString}` : '';

  return {
    airportName,
    ceiling: skyDescription,
    ceilingFeet: ceilingFeet ?? fallbackStation.ceilingFeet,
    visibility: formatVisibility(forecast.visib),
    visibilitySm,
    wind: formatWind(forecast.wdir, forecast.wspd, forecast.wgst),
    windDirection: normalizeWindDirection(forecast.wdir),
    windSpeed: Number(forecast.wspd) || 0,
    summary:
      getRawTafText(taf)
        ? `${getRawTafText(taf)}${wxString}`
        : fallbackStation.summary
  };
}

function getRawMetarText(metar) {
  return normalizeRawWeatherText(
    metar?.rawOb ??
      metar?.rawOB ??
      metar?.rawText ??
      metar?.raw ??
      metar?.metar ??
      metar?.text
  );
}

function getRawTafText(taf) {
  return normalizeRawWeatherText(
    taf?.rawTAF ??
      taf?.rawTaf ??
      taf?.rawText ??
      taf?.raw ??
      taf?.taf ??
      taf?.text
  );
}

function normalizeRawWeatherText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildLiveHazards({
  baseHazards,
  departure,
  destination,
  destinationForecast,
  awcData,
  flightSetup,
  flightPlan
}) {
  const forecastText = `${destinationForecast?.wxString ?? ''} ${destination.summary}`.toUpperCase();
  const minimumVisibility = Math.min(departure.visibilitySm, destination.visibilitySm);
  const lowestCeiling = Math.min(
    departure.ceilingFeet ?? Number.POSITIVE_INFINITY,
    destination.ceilingFeet ?? Number.POSITIVE_INFINITY
  );
  const convectiveSignal = /(?:^|[\s/])TS(?:$|[\s/])|VCTS|CB|CONVECTIVE SIGMET/.test(forecastText);
  const precipitationSignal = /RA|SN|DZ|FG|BR/.test(forecastText);
  const coldCloudSignal =
    Number(flightSetup.cruiseAltitude) >= 9000 &&
    lowestCeiling <= 4000 &&
    Number(flightPlan.routeDistanceNm) >= 80;
  const enrouteWorkloadLevel =
    minimumVisibility <= 5 || destination.windSpeed >= 18
      ? maxSeverity(baseHazards.convection.level, 'Moderate')
      : baseHazards.convection.level;
  const liveConvectionLevel = convectiveSignal
    ? 'High'
    : 'None';
  const icingLevel = coldCloudSignal
    ? maxSeverity(baseHazards.icing.level, Number(flightSetup.cruiseAltitude) >= 11000 ? 'Moderate' : 'Low')
    : baseHazards.icing.level;
  const visibilityLevel =
    minimumVisibility <= 3 || lowestCeiling < 1000
      ? 'High'
      : minimumVisibility <= 5 || lowestCeiling < 3000 || precipitationSignal
        ? maxSeverity(baseHazards.precipitationVisibility.level, 'Moderate')
        : baseHazards.precipitationVisibility.level;
  const displayHazards = buildDisplayedLiveHazards({
    awcDataText: collectLiveWeatherText({
      departureMetar: awcData?.departure?.metar?.rawOb,
      destinationMetar: awcData?.destination?.metar?.rawOb,
      destinationTaf: awcData?.destination?.taf?.rawTAF,
      destinationForecast: destinationForecast?.wxString
    }),
    awcData,
    destinationForecast
  });

  return {
    convection: {
      level: liveConvectionLevel,
      summary:
        convectiveSignal
          ? 'Destination forecast guidance near the planned arrival window includes thunderstorm or convective cloud signals.'
          : 'No explicit convective signal appears in the current live forecast guidance for this route window.'
    },
    enrouteWorkload: {
      level: enrouteWorkloadLevel,
      summary:
        enrouteWorkloadLevel === 'Moderate' || enrouteWorkloadLevel === 'High'
          ? 'Live wind and timing inputs suggest a higher-workload route environment than the baseline generated profile.'
          : 'Wind, timing, and route pacing do not stand out as a major workload concern beyond the baseline generated profile.'
    },
    display: displayHazards,
    icing: {
      level: icingLevel,
      summary:
        icingLevel === baseHazards.icing.level
          ? baseHazards.icing.summary
          : `FAA weather inputs plus the planned ${Number(flightSetup.cruiseAltitude).toLocaleString()} ft cruise altitude suggest added caution for colder cloud layers and icing exposure.`
    },
    precipitationVisibility: {
      level: visibilityLevel,
      summary:
        visibilityLevel === baseHazards.precipitationVisibility.level
          ? baseHazards.precipitationVisibility.summary
          : 'Live visibility, ceiling, and destination forecast cues indicate a more restrictive arrival environment than the baseline generated profile.'
    }
  };
}

function deriveLiveSuggestedResponses({
  flightSetup,
  flightPlan,
  departure,
  destination,
  destinationForecast,
  hazards,
  awcData
}) {
  const suggestedResponses = new Set();
  const observedMinimumVisibility = getObservedMinimumVisibility(awcData);
  const observedMinimumCeiling = getObservedMinimumCeiling(awcData);
  const observedDestinationVisibility = getObservedDestinationVisibility(awcData);
  const observedDestinationCeiling = getObservedDestinationCeiling(awcData);
  const arrivalHour = flightPlan.estimatedArrivalTime
    ? new Date(flightPlan.estimatedArrivalTime).getHours()
    : new Date(flightSetup.plannedDepartureTime).getHours();

  if (isVisibilityBetweenThreeAndFiveMiles(observedMinimumVisibility)) {
    suggestedResponses.add('environment-Visibility 3 to 5 miles');
  }

  if (isVisibilityBetweenOneAndThreeMiles(observedMinimumVisibility)) {
    suggestedResponses.add('environment-Visibility 1 to 3 miles');
  }

  if (Number.isFinite(observedDestinationVisibility) && observedDestinationVisibility < 1) {
    suggestedResponses.add('environment-Destination visibility less than 1 mile');
  }

  if (Number.isFinite(observedMinimumCeiling) && observedMinimumCeiling < 3000) {
    suggestedResponses.add("environment-Ceilings less than 3,000' AGL");
  }

  if (Number.isFinite(observedDestinationCeiling) && observedDestinationCeiling < 1000) {
    suggestedResponses.add('environment-Destination ceilings less than 1,000 feet AGL');
  }

  if (Number.isFinite(observedDestinationCeiling) && observedDestinationCeiling < 500) {
    suggestedResponses.add('environment-Destination ceilings less than 500 feet AGL');
  }

  if (hasPrecipitationObstructingVisibility({ awcData, destinationForecast })) {
    suggestedResponses.add('environment-Precipitation causing obstruction to visibility');
  }

  if (hasWetRunwayEvidence({ awcData, destinationForecast })) {
    suggestedResponses.add('environment-Wet runway');
  }

  if (hasCurrentDestinationWeatherReport(awcData)) {
    suggestedResponses.add('environment-Weather reporting at airport');
  }

  if (hasOperationalDestinationTower(awcData)) {
    suggestedResponses.add('environment-Operational control tower at destination');
  }

  if (hasFlightDurationOverThreeHours(flightPlan)) {
    suggestedResponses.add('pilot-Flight duration greater than 3 hours');
  }

  if (Number(flightSetup.cruiseAltitude) > 10000) {
    suggestedResponses.add('pilot-Day > 10,000 ft pressure altitude with no oxygen');
  }

  if ((arrivalHour < 7 || arrivalHour >= 20) && Number(flightSetup.cruiseAltitude) > 5000) {
    suggestedResponses.add('pilot-Night > 5,000 ft pressure altitude with no oxygen');
  }

  return [...suggestedResponses];
}

function hasCurrentDestinationWeatherReport(awcData) {
  return Boolean(awcData.destination?.metar?.rawOb);
}

function hasOperationalDestinationTower(awcData) {
  return awcData.destination?.airportInfo?.tower === 'T';
}

function buildLiveAdvisoryAnalysis({ awcData, flightSetup, flightPlan }) {
  const advisoryItems = [
    ...normalizeGairmetItems({ awcData, flightSetup, flightPlan }),
    ...normalizeAirSigmetItems({ awcData, flightSetup, flightPlan }),
    ...normalizeConvectiveWeatherEvidence({ awcData, flightSetup, flightPlan }),
    ...normalizeDestinationNotamItems({ awcData, flightSetup, flightPlan })
  ];
  const scoreableFactorIds = new Set();
  const suppressedFactorIds = new Set();

  advisoryItems.forEach((item) => {
    (item.scoreableFactorIds ?? []).forEach((id) => scoreableFactorIds.add(id));
    (item.suppressedFactorIds ?? []).forEach((id) => suppressedFactorIds.add(id));
  });
  const hasAdvisoryOnlyWeather = advisoryItems.some((item) => item.impact === 'advisory-only');
  const hasUnavailableNoticeData = awcData.advisories?.notams?.status === 'unavailable';
  const rawCounts = {
    gairmet: awcData.advisories?.gairmet?.length ?? 0,
    airsigmet: awcData.advisories?.airsigmet?.length ?? 0,
    notams: awcData.advisories?.notams?.items?.length ?? 0,
    total:
      (awcData.advisories?.gairmet?.length ?? 0) +
      (awcData.advisories?.airsigmet?.length ?? 0) +
      (awcData.advisories?.notams?.items?.length ?? 0)
  };

  return {
    scoreableFactorIds: [...scoreableFactorIds],
    suppressedFactorIds: [...suppressedFactorIds],
    debug: buildAdvisoryDebug({
      apiStatus: 'live',
      dataMode: 'live',
      fetchedSuccessfully: true,
      sourceUsed: 'FAA AWC API via app weather proxy',
      fetchErrorMessage: awcData.advisories?.notams?.details?.cause ?? null,
      rawCounts,
      mappedCount: advisoryItems.length
    }),
    display: {
      sources: {
        gairmet: 'live',
        airsigmet: 'live',
        notams: awcData.advisories?.notams?.status ?? 'unavailable'
      },
      note:
        awcData.advisories?.notams?.status === 'unavailable'
          ? awcData.advisories?.notams?.note ??
            'NOTAM data could not be parsed for this run, so NOTAM-based risk-factor mapping is unavailable.'
          : 'Relevant advisories and notices are summarized below.',
      officialWeatherGuidance:
        hasAdvisoryOnlyWeather || hasUnavailableNoticeData ? OFFICIAL_WEATHER_GUIDANCE : null,
      items: advisoryItems
    }
  };
}

function normalizeGairmetItems({ awcData, flightSetup, flightPlan }) {
  return (awcData.advisories?.gairmet ?? [])
    .map((item, index) => {
      const altitudeInfo = buildGairmetAltitudeInfo(item);

      return normalizePolygonAdvisoryItem({
        advisory: item,
        flightSetup,
        flightPlan,
        id: `gairmet-${index}`,
        source: 'G-AIRMET',
        title: formatGairmetTitle(item),
        rawText: [item.product, item.hazard, item.due_to].filter(Boolean).join(' | '),
        startTime: item.validTime ?? fromUnixSeconds(item.issueTime),
        endTime: fromUnixSeconds(item.expireTime),
        altitudeMinFt: altitudeInfo.overlapMinFt,
        altitudeMaxFt: altitudeInfo.overlapMaxFt,
        displayAltitudeMinFt: altitudeInfo.displayMinFt,
        displayAltitudeMaxFt: altitudeInfo.displayMaxFt,
        altitudeDisplayKind: altitudeInfo.displayKind,
        coords: normalizeCoords(item.coords),
        mapping: deriveAirmetMapping(item)
      });
    })
    .filter(Boolean);
}

function normalizeAirSigmetItems({ awcData, flightSetup, flightPlan }) {
  return (awcData.advisories?.airsigmet ?? [])
    .map((item, index) => {
      const altitudeInfo = buildAirSigmetAltitudeInfo(item);

      return normalizePolygonAdvisoryItem({
        advisory: item,
        flightSetup,
        flightPlan,
        id: `airsigmet-${index}`,
        source: item.airSigmetType === 'SIGMET' ? 'SIGMET' : 'AIRMET',
        title: formatAirSigmetTitle(item),
        rawText: item.rawAirSigmet ?? '',
        startTime: fromUnixSeconds(item.validTimeFrom) ?? item.creationTime,
        endTime: fromUnixSeconds(item.validTimeTo),
        altitudeMinFt: altitudeInfo.overlapMinFt,
        altitudeMaxFt: altitudeInfo.overlapMaxFt,
        displayAltitudeMinFt: altitudeInfo.displayMinFt,
        displayAltitudeMaxFt: altitudeInfo.displayMaxFt,
        altitudeDisplayKind: altitudeInfo.displayKind,
        coords: normalizeCoords(item.coords),
        mapping: deriveAirSigmetMapping(item)
      });
    })
    .filter(Boolean);
}

function formatGairmetTitle(item) {
  const product = String(item.product ?? '').trim().toUpperCase();
  const hazard = String(item.hazard ?? '').trim().toUpperCase();

  if (product === 'ZULU' && /FZLVL|FREEZING/.test(hazard)) {
    return 'AIRMET Zulu: Freezing Level';
  }

  if (product === 'ZULU') {
    return `AIRMET Zulu: ${formatAdvisoryLabel(item.hazard ?? 'Advisory')}`;
  }

  return `${item.product ?? 'G-AIRMET'} ${formatAdvisoryLabel(item.hazard ?? 'Advisory')}`.trim();
}

function formatAirSigmetTitle(item) {
  const type = item.airSigmetType ?? 'SIGMET';
  return `${type} ${formatAdvisoryLabel(item.hazard ?? 'Advisory')}`.trim();
}

function formatAdvisoryLabel(value) {
  const normalizedValue = String(value ?? '').trim();
  const upperValue = normalizedValue.toUpperCase();

  if (/FZLVL|FREEZING/.test(upperValue)) {
    return 'Freezing Level';
  }

  return normalizedValue || 'Advisory';
}

function buildGairmetAltitudeInfo(item) {
  const hazardText = String(item.hazard ?? '').toUpperCase();
  const isFreezingLevel = /FZLVL|FREEZING/.test(hazardText);
  const baseFt = parseAltitudeFeet(item.base);
  const topFt = parseAltitudeFeet(item.top);
  const freezingBaseFt = parseAltitudeFeet(item.fzlbase);
  const freezingTopFt = parseAltitudeFeet(item.fzltop);
  const levelFt = parseAltitudeFeet(item.level);
  const overlapMinFt = firstFinite([baseFt, freezingBaseFt]);
  const overlapMaxFt = firstFinite([topFt, freezingTopFt]);

  if (isFreezingLevel && Number.isFinite(levelFt)) {
    return {
      overlapMinFt,
      overlapMaxFt,
      displayMinFt: levelFt,
      displayMaxFt: levelFt,
      displayKind: 'freezing-level'
    };
  }

  if (isFreezingLevel && (Number.isFinite(baseFt) || Number.isFinite(topFt))) {
    return {
      overlapMinFt,
      overlapMaxFt,
      displayMinFt: baseFt,
      displayMaxFt: topFt,
      displayKind: 'freezing-level'
    };
  }

  if (String(item.base ?? '').trim().toUpperCase() === 'FZL') {
    return {
      overlapMinFt,
      overlapMaxFt,
      displayMinFt: firstFinite([freezingBaseFt, baseFt]),
      displayMaxFt: firstFinite([freezingTopFt, topFt]),
      displayKind: 'freezing-level'
    };
  }

  return {
    overlapMinFt,
    overlapMaxFt,
    displayMinFt: overlapMinFt,
    displayMaxFt: overlapMaxFt,
    displayKind: 'layer'
  };
}

function buildAirSigmetAltitudeInfo(item) {
  const overlapMinFt = firstFinite([
    parseAltitudeFeet(item.altitudeLow1),
    parseAltitudeFeet(item.altitudeLow2),
    parseAltitudeFeet(item.altitudeLow),
    parseAltitudeFeet(item.altitudeLo)
  ]);
  const overlapMaxFt = firstFinite([
    parseAltitudeFeet(item.altitudeHi1),
    parseAltitudeFeet(item.altitudeHi2),
    parseAltitudeFeet(item.altitudeHi),
    parseAltitudeFeet(item.altitudeHigh)
  ]);

  return {
    overlapMinFt,
    overlapMaxFt,
    displayMinFt: overlapMinFt,
    displayMaxFt: overlapMaxFt,
    displayKind: 'layer'
  };
}

function firstFinite(values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function normalizeConvectiveWeatherEvidence({ awcData, flightSetup, flightPlan }) {
  const corridorNm = 20;
  const flightWindow = buildFlightWindow(flightSetup, flightPlan);
  const routeSegment = buildRouteSegment(flightPlan);
  const departurePoint = toRoutePoint(flightPlan.departure);
  const destinationPoint = toRoutePoint(flightPlan.destination);
  const departureText = awcData.departure?.metar?.rawOb ?? '';
  const destinationText = [
    awcData.destination?.metar?.rawOb,
    awcData.destination?.taf?.rawTAF
  ]
    .filter(Boolean)
    .join(' ');
  const convectivePattern = /(?:^|[\s/])TS(?:$|[\s/])|VCTS|CB/;
  const pointEvidence = [
    {
      id: 'convective-departure',
      title: 'Departure station convective weather evidence',
      point: departurePoint,
      rawText: departureText,
      summary: 'Departure METAR includes convective weather evidence.'
    },
    {
      id: 'convective-destination',
      title: 'Destination station convective weather evidence',
      point: destinationPoint,
      rawText: destinationText,
      summary: 'Destination METAR/TAF includes convective weather evidence.'
    }
  ];

  return pointEvidence
    .filter((item) => convectivePattern.test(item.rawText.toUpperCase()))
    .map((item) => {
      const routeOverlap = pointOverlapsRoute(item.point, routeSegment, corridorNm);
      const timeOverlap = flightWindow.isValid;

      if (!routeOverlap || !timeOverlap) {
        return null;
      }

      return {
        id: item.id,
        source: 'METAR/TAF',
        title: item.title,
        summary: item.summary,
        rawText: item.rawText,
        overlap: {
          route: routeOverlap,
          time: timeOverlap,
          altitude: true
        },
        mappedFactorLabels: [
          'Convective activity within 20 NM of flight',
          'Convective activity with no storm scope or other means of detection capability',
          'Convective activity with detection capability'
        ],
        scoreableFactorIds: [
          factorIdForEnvironment('Convective activity within 20 NM of flight')
        ],
        suppressedFactorIds: [],
        impact: 'scoreable',
        advisoryOnlyReason:
          'Aircraft storm-scope or detection capability is not modeled in the live weather layer, so only the base convective factor is auto-selected.'
      };
    })
    .filter(Boolean);
}

function normalizeDestinationNotamItems({ awcData, flightSetup, flightPlan }) {
  const notamBundle = awcData.advisories?.notams;

  if (!notamBundle || !Array.isArray(notamBundle.items)) {
    return [];
  }

  return notamBundle.items
    .map((item) => normalizeNotamItem({
      advisory: item,
      flightSetup,
      flightPlan
    }))
    .filter(Boolean);
}

function normalizePolygonAdvisoryItem({
  advisory,
  flightSetup,
  flightPlan,
  id,
  source,
  title,
  rawText,
  startTime,
  endTime,
  altitudeMinFt,
  altitudeMaxFt,
  displayAltitudeMinFt,
  displayAltitudeMaxFt,
  altitudeDisplayKind = 'layer',
  coords,
  mapping
}) {
  const flightWindow = buildFlightWindow(flightSetup, flightPlan);
  const routeSegment = buildRouteSegment(flightPlan);
  const routeOverlap = polygonOverlapsRoute(coords, routeSegment, 20);
  const timeOverlap = advisoryOverlapsTimeWindow(startTime, endTime, flightWindow);
  const altitudeOverlap = advisoryOverlapsAltitude(
    altitudeMinFt,
    altitudeMaxFt,
    Number(flightSetup.cruiseAltitude) || 0
  );

  if (!routeOverlap || !timeOverlap || !altitudeOverlap) {
    return null;
  }

  const mappedFactorLabels = mapping.factorLabels ?? [];
  const altitudeDisplay = formatAdvisoryAltitudeDisplay({
    altitudeMinFt: displayAltitudeMinFt,
    altitudeMaxFt: displayAltitudeMaxFt,
    displayKind: altitudeDisplayKind
  });

  return {
    id,
    source,
    title,
    summary: mapping.summary,
    rawText,
    altitudeMinFt: displayAltitudeMinFt,
    altitudeMaxFt: displayAltitudeMaxFt,
    altitudeDisplay,
    overlap: {
      route: routeOverlap,
      time: timeOverlap,
      altitude: altitudeOverlap
    },
    mappedFactorLabels,
    scoreableFactorIds: (mapping.scoreableFactorLabels ?? []).map(factorIdForEnvironment),
    suppressedFactorIds: mapping.suppressed ? mappedFactorLabels.map(factorIdForEnvironment) : [],
    impact: mapping.suppressed ? 'suppresses' : mapping.scoreable ? 'scoreable' : 'advisory-only',
    advisoryOnlyReason: mapping.advisoryOnlyReason ?? null,
    officialWeatherGuidance:
      mapping.scoreable || mapping.suppressed ? null : mapping.officialWeatherGuidance ?? OFFICIAL_WEATHER_GUIDANCE
  };
}

function normalizeNotamItem({ advisory, flightSetup, flightPlan }) {
  const mapping = deriveNotamMapping(advisory.rawText);

  if (!mapping) {
    return null;
  }

  const flightWindow = buildFlightWindow(flightSetup, flightPlan);
  const routeOverlap = advisory.airportCode === flightPlan.destinationAirport;
  const timeOverlap = advisoryOverlapsTimeWindow(advisory.startTime, advisory.endTime, flightWindow);

  if (!routeOverlap || !timeOverlap) {
    return null;
  }

  return {
    id: advisory.id,
    source: 'NOTAM',
    title: mapping.title,
    summary: mapping.summary,
    rawText: advisory.rawText,
    overlap: {
      route: routeOverlap,
      time: timeOverlap,
      altitude: true
    },
    mappedFactorLabels: mapping.factorLabels,
    scoreableFactorIds: [],
    suppressedFactorIds: mapping.factorLabels.map(factorIdForEnvironment),
    impact: 'suppresses',
    advisoryOnlyReason: null
  };
}

function deriveAirmetMapping(item) {
  const advisoryText = `${item.hazard ?? ''} ${item.due_to ?? ''} ${item.product ?? ''}`.toUpperCase();

  if (/FZLVL|FREEZING LEVEL/.test(advisoryText)) {
    return {
      factorLabels: [],
      scoreableFactorLabels: [],
      scoreable: false,
      suppressed: false,
      summary: 'Freezing-level guidance overlaps this flight’s route or time window.',
      advisoryOnlyReason:
        'This product is shown for awareness and is not directly scored unless it maps to a defined v1 icing factor.',
      officialWeatherGuidance: OFFICIAL_WEATHER_GUIDANCE
    };
  }

  if (/ICE|ICING|FZRA|FZDZ/.test(advisoryText)) {
    return {
      factorLabels: ['Icing forecast (AIRMET > light) at required altitude with de-icing equipment'],
      scoreableFactorLabels: [],
      scoreable: false,
      suppressed: false,
      summary: 'Icing advisory overlaps the route, time window, and planned altitude.',
      advisoryOnlyReason:
        'De-icing equipment status is not modeled in the live weather layer, so this advisory is shown without auto-selecting the scoreable factor.',
      officialWeatherGuidance: OFFICIAL_WEATHER_GUIDANCE
    };
  }

  return {
    factorLabels: [],
    scoreableFactorLabels: [],
    scoreable: false,
    suppressed: false,
    summary: 'Advisory overlaps the route, time window, and planned altitude.',
    advisoryOnlyReason: 'No clean factor mapping exists for this advisory in the current factor table.',
    officialWeatherGuidance: ADVISORY_ONLY_WEATHER_GUIDANCE
  };
}

function deriveAirSigmetMapping(item) {
  const advisoryText = `${item.hazard ?? ''} ${item.rawAirSigmet ?? ''}`.toUpperCase();

  if (/CONVECTIVE|TS|VCTS|CB/.test(advisoryText)) {
    return {
      factorLabels: [
        'Convective activity within 20 NM of flight',
        'Convective activity with no storm scope or other means of detection capability',
        'Convective activity with detection capability'
      ],
      scoreableFactorLabels: ['Convective activity within 20 NM of flight'],
      scoreable: true,
      suppressed: false,
      summary: 'Convective advisory overlaps the route and flight window.',
      advisoryOnlyReason:
        'Aircraft storm-detection capability is not modeled in the live weather layer, so only the base convective factor is auto-selected.'
    };
  }

  if (/ICE|ICING|FZRA|FZDZ/.test(advisoryText)) {
    return {
      factorLabels: ['Icing forecast (AIRMET > light) at required altitude with de-icing equipment'],
      scoreableFactorLabels: [],
      scoreable: false,
      suppressed: false,
      summary: 'Icing-related advisory overlaps the route, time window, and planned altitude.',
      advisoryOnlyReason:
        'De-icing equipment status is not modeled in the live weather layer, so this advisory is shown without auto-selecting the scoreable factor.',
      officialWeatherGuidance: OFFICIAL_WEATHER_GUIDANCE
    };
  }

  return {
    factorLabels: [],
    scoreableFactorLabels: [],
    scoreable: false,
    suppressed: false,
    summary: 'Advisory overlaps the route and flight window.',
    advisoryOnlyReason: 'No clean factor mapping exists for this advisory in the current factor table.',
    officialWeatherGuidance: ADVISORY_ONLY_WEATHER_GUIDANCE
  };
}

function deriveNotamMapping(rawText) {
  const normalizedText = rawText.toUpperCase();

  if (/\b(TWR|CONTROL TOWER)\b.*\b(CLSD|CLOSED|LIMITED|UNAVBL|NOT AVBL|OTS|O\/S)\b/.test(normalizedText)) {
    return {
      title: 'Destination tower NOTAM',
      summary: 'Destination NOTAM indicates the control tower is closed or limited during the flight window.',
      factorLabels: ['Operational control tower at destination']
    };
  }

  if (/\b(PAPI|VASI)\b.*\b(OTS|O\/S|OUT OF SERVICE|UNAVBL|NOT AVBL|U\/S)\b/.test(normalizedText)) {
    return {
      title: 'Destination visual glide path NOTAM',
      summary: 'Destination NOTAM indicates PAPI or VASI is out of service during the flight window.',
      factorLabels: ['VASI/PAPI at destination']
    };
  }

  if (/\b(AWOS|ASOS|AUTO WX|WEATHER)\b.*\b(OTS|O\/S|OUT OF SERVICE|UNAVBL|NOT AVBL|U\/S)\b/.test(normalizedText)) {
    return {
      title: 'Destination weather reporting NOTAM',
      summary: 'Destination NOTAM indicates on-airport weather reporting is unavailable during the flight window.',
      factorLabels: ['Weather reporting at airport']
    };
  }

  return null;
}

function factorIdForEnvironment(label) {
  return `environment-${label}`;
}

function formatAdvisoryAltitudeDisplay({ altitudeMinFt, altitudeMaxFt, displayKind }) {
  const hasMin = Number.isFinite(altitudeMinFt);
  const hasMax = Number.isFinite(altitudeMaxFt);

  if (!hasMin && !hasMax) {
    return null;
  }

  if (displayKind === 'freezing-level' && hasMin && hasMax && altitudeMinFt === altitudeMaxFt) {
    return `freezing level near ${formatAltitudeFeet(altitudeMinFt)}`;
  }

  if (displayKind === 'freezing-level' && hasMin && !hasMax) {
    return `freezing level near ${formatAltitudeFeet(altitudeMinFt)}`;
  }

  if (displayKind === 'freezing-level' && !hasMin && hasMax) {
    return `freezing level near ${formatAltitudeFeet(altitudeMaxFt)}`;
  }

  if (hasMin && hasMax) {
    return `${formatAltitudeFeet(altitudeMinFt)} to ${formatAltitudeFeet(altitudeMaxFt)}`;
  }

  if (hasMax) {
    return `top ${formatAltitudeFeet(altitudeMaxFt)}`;
  }

  return `base ${formatAltitudeFeet(altitudeMinFt)}`;
}

function formatAltitudeFeet(value) {
  if (value === 0) {
    return 'surface';
  }

  return `${value.toLocaleString()} ft`;
}

function buildFlightWindow(flightSetup, flightPlan) {
  const departureTime = Date.parse(flightSetup.plannedDepartureTime);
  const arrivalTime = Date.parse(flightPlan.estimatedArrivalTime ?? flightSetup.plannedDepartureTime);

  return {
    startMs: departureTime,
    endMs: arrivalTime,
    isValid: Number.isFinite(departureTime) && Number.isFinite(arrivalTime)
  };
}

function advisoryOverlapsTimeWindow(startTime, endTime, flightWindow) {
  if (!flightWindow.isValid) {
    return false;
  }

  const advisoryStart = Date.parse(startTime ?? '');
  const advisoryEnd = endTime ? Date.parse(endTime) : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(advisoryStart)) {
    return false;
  }

  return advisoryStart <= flightWindow.endMs && advisoryEnd >= flightWindow.startMs;
}

function advisoryOverlapsAltitude(minAltitudeFt, maxAltitudeFt, plannedAltitudeFt) {
  if (!Number.isFinite(plannedAltitudeFt) || plannedAltitudeFt <= 0) {
    return false;
  }

  if (!Number.isFinite(minAltitudeFt) && !Number.isFinite(maxAltitudeFt)) {
    return true;
  }

  const lowerBound = Number.isFinite(minAltitudeFt) ? minAltitudeFt : 0;
  const upperBound = Number.isFinite(maxAltitudeFt) ? maxAltitudeFt : Number.POSITIVE_INFINITY;

  return plannedAltitudeFt >= lowerBound && plannedAltitudeFt <= upperBound;
}

function buildRouteSegment(flightPlan) {
  const departure = toRoutePoint(flightPlan.departure);
  const destination = toRoutePoint(flightPlan.destination);

  return departure && destination ? { departure, destination } : null;
}

function toRoutePoint(airport) {
  if (!airport || !Number.isFinite(Number(airport.lat)) || !Number.isFinite(Number(airport.lon))) {
    return null;
  }

  return {
    lat: Number(airport.lat),
    lon: Number(airport.lon)
  };
}

function normalizeCoords(coords) {
  return (coords ?? [])
    .map((coord) => ({
      lat: Number(coord.lat),
      lon: Number(coord.lon)
    }))
    .filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lon));
}

function parseAltitudeFeet(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value).trim().toUpperCase();

  if (!normalized || normalized === 'SFC') {
    return 0;
  }

  if (normalized.startsWith('FL')) {
    const flightLevel = Number(normalized.slice(2));
    return Number.isFinite(flightLevel) ? flightLevel * 100 : null;
  }

  const numericValue = Number(normalized);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue <= 600 ? numericValue * 100 : numericValue;
}

function fromUnixSeconds(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return new Date(numericValue * 1000).toISOString();
}

function pointOverlapsRoute(point, routeSegment, corridorNm) {
  if (!point || !routeSegment) {
    return false;
  }

  return distancePointToRouteNm(point, routeSegment) <= corridorNm;
}

function polygonOverlapsRoute(coords, routeSegment, corridorNm) {
  if (!routeSegment || !Array.isArray(coords) || coords.length < 3) {
    return false;
  }

  if (pointInPolygon(routeSegment.departure, coords) || pointInPolygon(routeSegment.destination, coords)) {
    return true;
  }

  if (coords.some((point) => distancePointToRouteNm(point, routeSegment) <= corridorNm)) {
    return true;
  }

  for (let index = 0; index < coords.length - 1; index += 1) {
    if (segmentsIntersect(routeSegment.departure, routeSegment.destination, coords[index], coords[index + 1])) {
      return true;
    }
  }

  return false;
}

function distancePointToRouteNm(point, routeSegment) {
  const referenceLat = (routeSegment.departure.lat + routeSegment.destination.lat + point.lat) / 3;
  const projectedDeparture = projectToNm(routeSegment.departure, referenceLat);
  const projectedDestination = projectToNm(routeSegment.destination, referenceLat);
  const projectedPoint = projectToNm(point, referenceLat);

  return distancePointToSegment(projectedPoint, projectedDeparture, projectedDestination);
}

function projectToNm(point, referenceLat) {
  const radians = (referenceLat * Math.PI) / 180;

  return {
    x: point.lon * 60 * Math.cos(radians),
    y: point.lat * 60
  };
}

function distancePointToSegment(point, start, end) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = (
    ((point.x - start.x) * segmentX) + ((point.y - start.y) * segmentY)
  ) / segmentLengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const nearestPoint = {
    x: start.x + (segmentX * clampedProjection),
    y: start.y + (segmentY * clampedProjection)
  };

  return Math.hypot(point.x - nearestPoint.x, point.y - nearestPoint.y);
}

function pointInPolygon(point, polygon) {
  let isInside = false;

  for (let left = 0, right = polygon.length - 1; left < polygon.length; right = left++) {
    const leftPoint = polygon[left];
    const rightPoint = polygon[right];
    const intersects = (
      (leftPoint.lat > point.lat) !== (rightPoint.lat > point.lat)
    ) && (
      point.lon <
      ((rightPoint.lon - leftPoint.lon) * (point.lat - leftPoint.lat)) /
        ((rightPoint.lat - leftPoint.lat) || Number.EPSILON) +
        leftPoint.lon
    );

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function segmentsIntersect(a1, a2, b1, b2) {
  const first = orientation(a1, a2, b1);
  const second = orientation(a1, a2, b2);
  const third = orientation(b1, b2, a1);
  const fourth = orientation(b1, b2, a2);

  return first !== second && third !== fourth;
}

function orientation(pointA, pointB, pointC) {
  const value =
    ((pointB.lon - pointA.lon) * (pointC.lat - pointA.lat)) -
    ((pointB.lat - pointA.lat) * (pointC.lon - pointA.lon));

  if (value === 0) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function hydrateMetadata(autoSelectedIds) {
  const selectionSet = new Set(autoSelectedIds);

  return Object.fromEntries(
    Object.entries(assessmentMetadata).map(([group, items]) => [
      group,
      items.map((item) => ({
        ...item,
        autoSelected: selectionSet.has(item.id)
      }))
    ])
  );
}

function hasFlightDurationOverThreeHours(flightPlan) {
  const cruiseTimeMinutes = Number(flightPlan.cruiseTimeMinutes);
  const operationalBufferMinutes = Number(flightPlan.operationalBufferMinutes);

  if (!Number.isFinite(cruiseTimeMinutes) || !Number.isFinite(operationalBufferMinutes)) {
    return false;
  }

  return cruiseTimeMinutes + operationalBufferMinutes > 180;
}

function getObservedMinimumVisibility(awcData) {
  const visibilityValues = [
    parseVisibility(awcData.departure?.metar?.visib),
    parseVisibility(awcData.destination?.metar?.visib)
  ].filter((value) => Number.isFinite(value));

  return visibilityValues.length > 0 ? Math.min(...visibilityValues) : null;
}

function isVisibilityBetweenThreeAndFiveMiles(visibilitySm) {
  return Number.isFinite(visibilitySm) && visibilitySm >= 3 && visibilitySm <= 5;
}

function isVisibilityBetweenOneAndThreeMiles(visibilitySm) {
  return Number.isFinite(visibilitySm) && visibilitySm >= 1 && visibilitySm < 3;
}

function getObservedDestinationVisibility(awcData) {
  const visibility = parseVisibility(awcData.destination?.metar?.visib);
  return Number.isFinite(visibility) ? visibility : null;
}

function getObservedMinimumCeiling(awcData) {
  const ceilingValues = [
    determineCeilingFeet(awcData.departure?.metar?.clouds),
    determineCeilingFeet(awcData.destination?.metar?.clouds)
  ].filter((value) => Number.isFinite(value));

  return ceilingValues.length > 0 ? Math.min(...ceilingValues) : null;
}

function getObservedDestinationCeiling(awcData) {
  const ceiling = determineCeilingFeet(awcData.destination?.metar?.clouds);
  return Number.isFinite(ceiling) ? ceiling : null;
}

function hasPrecipitationObstructingVisibility({ awcData, destinationForecast }) {
  const visibilityValues = [
    parseVisibility(awcData.departure?.metar?.visib),
    parseVisibility(awcData.destination?.metar?.visib),
    parseVisibility(destinationForecast?.visib)
  ].filter((value) => Number.isFinite(value));
  const minimumVisibility = visibilityValues.length > 0 ? Math.min(...visibilityValues) : null;

  return hasWetRunwayEvidence({ awcData, destinationForecast }) && Number.isFinite(minimumVisibility) && minimumVisibility < 7;
}

function hasWetRunwayEvidence({ awcData, destinationForecast }) {
  const weatherText = collectLiveWeatherText({
    departureMetar: awcData.departure?.metar?.rawOb,
    destinationMetar: awcData.destination?.metar?.rawOb,
    destinationTaf: awcData.destination?.taf?.rawTAF,
    destinationForecast: destinationForecast?.wxString
  });

  return /(?:^|[\s/+-])(TSRA|SHRA|FZRA|FZDZ|RA|SN|DZ|PL|GR|GS)(?:$|[\s/+-])/.test(weatherText);
}

function buildDisplayedLiveHazards({ awcDataText, awcData, destinationForecast }) {
  const convectiveEvidence = /(?:^|[\s/])TS(?:$|[\s/])|VCTS|CB|CONVECTIVE SIGMET/.test(awcDataText);
  const icingEvidence = /FZRA|FZDZ|ICING|AIRMET ZULU|ZR/.test(awcDataText);
  const precipitationVisibilityEvidence = hasPrecipitationObstructingVisibility({
    awcData,
    destinationForecast
  });
  const noExplicitHazards = !convectiveEvidence && !icingEvidence && !precipitationVisibilityEvidence;

  return {
    convection: {
      level: convectiveEvidence ? 'High' : 'None',
      summary: convectiveEvidence
        ? 'Current live weather guidance includes explicit convective indicators along the route window, including thunderstorm or convective cloud signals.'
        : 'No significant enroute hazard identified from current available data.'
    },
    icing: {
      level: icingEvidence ? 'Moderate' : 'None',
      summary: icingEvidence
        ? 'Current live weather guidance includes explicit freezing or icing-related indicators relevant to the planned route window.'
        : 'Limited enroute interpretation from current route data; no explicit icing indicator is present in the available live weather text.'
    },
    precipitationVisibility: {
      level: precipitationVisibilityEvidence ? 'Moderate' : 'None',
      summary: precipitationVisibilityEvidence
        ? 'Current live weather shows precipitation with reduced visibility, indicating a meaningful enroute visibility concern.'
        : noExplicitHazards
          ? 'Limited enroute interpretation from current route data.'
          : 'No explicit precipitation-related visibility restriction is identified in the current available data.'
    },
    interpretation: {
      level: 'None',
      summary: noExplicitHazards
        ? 'No significant enroute hazard identified from current available data.'
        : 'Displayed enroute hazards are limited to explicit live-weather evidence available for this route window.'
    }
  };
}

function collectLiveWeatherText({
  departureMetar = '',
  destinationMetar = '',
  destinationTaf = '',
  destinationForecast = ''
}) {
  return [departureMetar, destinationMetar, destinationTaf, destinationForecast]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function buildPseudoMetar({
  stationCode,
  activeHour,
  windDirection,
  windSpeed,
  visibilityValue,
  cloudDescriptor,
  ceilingFeet,
  temperatureC,
  dewpointC
}) {
  const descriptorToken = toCloudToken(cloudDescriptor);
  const ceilingHundreds = String(Math.round(ceilingFeet / 100)).padStart(3, '0');
  const day = '21';
  const hour = String(activeHour).padStart(2, '0');
  const windToken = `${String(windDirection).padStart(3, '0')}${String(windSpeed).padStart(2, '0')}KT`;

  return `${stationCode} ${day}${hour}00Z ${windToken} ${visibilityValue}SM ${descriptorToken}${ceilingHundreds} ${formatTempToken(temperatureC)}/${formatTempToken(dewpointC)}`;
}

function selectTafForecast(taf, estimatedArrivalTime) {
  if (!taf || !Array.isArray(taf.fcsts) || taf.fcsts.length === 0) {
    return null;
  }

  const arrivalDate = estimatedArrivalTime ? new Date(estimatedArrivalTime) : null;

  if (!arrivalDate || Number.isNaN(arrivalDate.getTime())) {
    return taf.fcsts[0];
  }

  const arrivalEpoch = Math.floor(arrivalDate.getTime() / 1000);

  return (
    taf.fcsts.find((forecast) => arrivalEpoch >= forecast.timeFrom && arrivalEpoch < forecast.timeTo) ??
    taf.fcsts[0]
  );
}

function determineCeilingFeet(clouds) {
  if (!Array.isArray(clouds) || clouds.length === 0) {
    return null;
  }

  const ceilingLayers = clouds
    .filter((cloud) => ['BKN', 'OVC', 'OVX', 'VV'].includes(cloud.cover))
    .map((cloud) => Number(cloud.base))
    .filter((base) => Number.isFinite(base) && base > 0);

  return ceilingLayers.length > 0 ? Math.min(...ceilingLayers) : null;
}

function formatCloudLayers(clouds) {
  if (!Array.isArray(clouds) || clouds.length === 0) {
    return 'Clear';
  }

  return clouds
    .slice(0, 2)
    .map((cloud) => `${skyCoverLabel(cloud.cover)} ${Number(cloud.base).toLocaleString()} ft`)
    .join(' / ');
}

function skyCoverLabel(cover) {
  if (cover === 'CLR' || cover === 'SKC') {
    return 'Clear';
  }

  if (cover === 'FEW') {
    return 'Few';
  }

  if (cover === 'SCT') {
    return 'Scattered';
  }

  if (cover === 'BKN') {
    return 'Broken';
  }

  if (cover === 'OVC' || cover === 'OVX') {
    return 'Overcast';
  }

  if (cover === 'VV') {
    return 'Vertical visibility';
  }

  return cover || 'Clouds';
}

function parseVisibility(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return 10;
  }

  const numericVisibility = parseFloat(value.replace('+', ''));
  return Number.isFinite(numericVisibility) ? numericVisibility : 10;
}

function formatVisibility(value) {
  if (typeof value === 'string') {
    return `${value.replace('+', '+')} SM`;
  }

  if (typeof value === 'number') {
    return `${value} SM`;
  }

  return '10 SM';
}

function formatWind(direction, speed, gust) {
  const normalizedSpeed = Number(speed) || 0;
  const windDirection = typeof direction === 'string' ? direction : String(direction ?? 0).padStart(3, '0');
  const gustText = gust ? ` gust ${gust} kt` : '';
  return `${windDirection} at ${normalizedSpeed} kt${gustText}`;
}

function normalizeWindDirection(direction) {
  if (direction === 'VRB') {
    return null;
  }

  const numericDirection = Number(direction);
  return Number.isFinite(numericDirection) ? numericDirection : null;
}

function normalizeAirportName(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value.replace(/\/+$/g, '').trim();
}

function buildSourceFingerprint(awcData) {
  return [
    awcData.departure?.metar?.receiptTime,
    awcData.destination?.metar?.receiptTime,
    awcData.departure?.taf?.issueTime,
    awcData.destination?.taf?.issueTime,
    awcData.departure?.stationInfo?.icaoId,
    awcData.destination?.stationInfo?.icaoId,
    awcData.departure?.airportInfo?.icaoId,
    awcData.destination?.airportInfo?.icaoId,
    awcData.advisories?.gairmet?.length,
    awcData.advisories?.airsigmet?.length,
    awcData.advisories?.notams?.status,
    awcData.advisories?.notams?.items?.length
  ]
    .filter(Boolean)
    .join('|');
}

function severityFromScore(score) {
  if (score <= 0) {
    return 'None';
  }

  if (score === 1) {
    return 'Low';
  }

  if (score === 2) {
    return 'Moderate';
  }

  return 'High';
}

function maxSeverity(left, right) {
  const ranking = { None: 0, Low: 1, Moderate: 2, High: 3 };
  return ranking[left] >= ranking[right] ? left : right;
}

function toCloudToken(cloudDescriptor) {
  if (cloudDescriptor === 'Broken') {
    return 'BKN';
  }

  if (cloudDescriptor === 'Scattered') {
    return 'SCT';
  }

  return 'FEW';
}

function formatTempToken(value) {
  return value < 0 ? `M${String(Math.abs(value)).padStart(2, '0')}` : String(value).padStart(2, '0');
}

function hashString(value) {
  return [...value].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) % 2147483647,
    7
  );
}

function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
