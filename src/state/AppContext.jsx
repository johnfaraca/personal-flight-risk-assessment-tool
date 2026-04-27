import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { buildAssessmentMetadata } from '../engine/factors';
import { calculateFlightPlan } from '../utils/flight';
import { fetchAirportLookup } from '../services/airportService';
import {
  fetchWeatherPicture,
  getDemoWeatherPicture,
  getUnavailableWeatherPicture
} from '../services/weatherService';
import {
  fetchAiExplanation,
  getUnavailableAiExplanation
} from '../services/aiExplanationService';
import {
  evaluateAssessment,
  getInitialResponses
} from '../engine/scoringEngine';
import { clearAssessmentSessionStorage } from '../utils/assessmentContextStorage';

const AppContext = createContext(null);

const defaultFlightSetup = createDefaultFlightSetup();

const assessmentMetadata = buildAssessmentMetadata();
const defaultFlightPlan = calculateFlightPlan(defaultFlightSetup, {});

function AppProvider({ children }) {
  const [flightSetup, setFlightSetup] = useState(defaultFlightSetup);
  const [missionRule, setMissionRule] = useState('VFR');
  const [responses, setResponses] = useState(getInitialResponses(assessmentMetadata));
  const [ifrEligibility, setIfrEligibility] = useState(null);
  const [appliedWeatherSignature, setAppliedWeatherSignature] = useState(null);
  const [weatherMode, setWeatherMode] = useState('live');
  const [weatherPicture, setWeatherPicture] = useState(() =>
    getUnavailableWeatherPicture(
      defaultFlightSetup,
      defaultFlightPlan,
      'Enter flight details to request live weather.'
    )
  );
  const [weatherStatus, setWeatherStatus] = useState('idle');
  const [weatherError, setWeatherError] = useState(null);
  const [resolvedAirports, setResolvedAirports] = useState({
    departure: null,
    destination: null
  });
  const [airportLookupError, setAirportLookupError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(() =>
    getUnavailableAiExplanation(
      'Live AI explanation is unavailable until a live explanation request is attempted.'
    )
  );
  const [aiExplanationStatus, setAiExplanationStatus] = useState('idle');

  const flightPlan = useMemo(
    () => calculateFlightPlan(flightSetup, resolvedAirports, airportLookupError),
    [flightSetup, resolvedAirports, airportLookupError]
  );

  useEffect(() => {
    const departureAirport = String(flightSetup.departureAirport ?? '').trim().toUpperCase();
    const destinationAirport = String(flightSetup.destinationAirport ?? '').trim().toUpperCase();

    if (!departureAirport || !destinationAirport) {
      setResolvedAirports({ departure: null, destination: null });
      setAirportLookupError(null);
      return undefined;
    }

    let active = true;

    setResolvedAirports({ departure: null, destination: null });
    setAirportLookupError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const lookup = await fetchAirportLookup({
          departureAirport,
          destinationAirport
        });

        if (!active) {
          return;
        }

        setResolvedAirports({
          departure: lookup.departure,
          destination: lookup.destination
        });
        setAirportLookupError(lookup.error?.message ?? null);
      } catch (error) {
        if (!active) {
          return;
        }

        setResolvedAirports({ departure: null, destination: null });
        setAirportLookupError(error.message || 'Airport lookup failed.');
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [flightSetup.departureAirport, flightSetup.destinationAirport]);

  useEffect(() => {
    if (weatherMode === 'demo') {
      const demoFlightSetup = createDemoFlightSetup();
      const demoResolvedAirports =
        flightSetup.departureAirport === demoFlightSetup.departureAirport &&
        flightSetup.destinationAirport === demoFlightSetup.destinationAirport
          ? resolvedAirports
          : {};

      setWeatherPicture(
        getDemoWeatherPicture(
          demoFlightSetup,
          calculateFlightPlan(demoFlightSetup, demoResolvedAirports),
          'Weather context loaded.'
        )
      );
      setWeatherStatus('demo');
      setWeatherError(null);
      return undefined;
    }

    if (!flightPlan.hasRequiredFlightInputs) {
      setWeatherPicture(
        getUnavailableWeatherPicture(
          flightSetup,
          flightPlan,
          'Enter departure airport, destination airport, departure time, cruise altitude, and cruise speed to request live weather.'
        )
      );
      setWeatherStatus('idle');
      setWeatherError(null);
      return undefined;
    }

    let active = true;
    setWeatherPicture(
      getUnavailableWeatherPicture(
        flightSetup,
        flightPlan,
        'Loading live weather from the FAA AWC service layer.'
      )
    );
    setWeatherStatus('loading');
    setWeatherError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const nextWeatherPicture = await fetchWeatherPicture(flightSetup);

        if (!active) {
          return;
        }

        setWeatherPicture(nextWeatherPicture);
        setWeatherStatus(nextWeatherPicture.apiHook?.status ?? 'live');
        setWeatherError(null);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error('[weather] classified client failure', {
          code: error.code || 'unknown',
          message: error.message,
          details: error.details || null
        });

        setWeatherPicture(
          getUnavailableWeatherPicture(
            flightSetup,
            flightPlan,
            error.message ||
              'FAA AWC live weather is unavailable. Review the flight inputs and try again.'
          )
        );
        setWeatherStatus('error');
        setWeatherError({
          code: error.code || 'unknown',
          message: error.message,
          details: error.details || null
        });
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [flightPlan, flightSetup, weatherMode]);

  const assessmentResult = useMemo(
    () =>
      evaluateAssessment({
        missionRule,
        responses,
        weatherPicture
      }),
    [missionRule, responses, weatherPicture]
  );

  useEffect(() => {
    setAiExplanation(
      getUnavailableAiExplanation(
        'Request a live AI explanation from the Results screen. Scores and recommendations do not depend on it.'
      )
    );
    setAiExplanationStatus('idle');
  }, [assessmentResult]);

  async function requestAiExplanation() {
    setAiExplanationStatus('loading');

    try {
      const nextExplanation = await fetchAiExplanation(assessmentResult);
      setAiExplanation(nextExplanation);
      setAiExplanationStatus(nextExplanation.status ?? 'live');
    } catch (error) {
      setAiExplanation(getUnavailableAiExplanation(error.message));
      setAiExplanationStatus('error');
    }
  }

  function loadDemoScenario() {
    setFlightSetup(createDemoFlightSetup());
    setWeatherMode('demo');
  }

  function useLiveWeather() {
    setWeatherMode('live');
  }

  function resetAssessmentState() {
    const nextFlightSetup = createDefaultFlightSetup();
    const nextFlightPlan = calculateFlightPlan(nextFlightSetup, {});

    setFlightSetup(nextFlightSetup);
    setMissionRule('VFR');
    setResponses(getInitialResponses(assessmentMetadata));
    setIfrEligibility(null);
    setAppliedWeatherSignature(null);
    setWeatherMode('live');
    setWeatherPicture(
      getUnavailableWeatherPicture(
        nextFlightSetup,
        nextFlightPlan,
        'Enter flight details to request live weather.'
      )
    );
    setWeatherStatus('idle');
    setWeatherError(null);
    setResolvedAirports({ departure: null, destination: null });
    setAirportLookupError(null);
    setAiExplanation(
      getUnavailableAiExplanation(
        'Live AI explanation is unavailable until a live explanation request is attempted.'
      )
    );
    setAiExplanationStatus('idle');
    clearAssessmentSessionStorage();
  }

  const weatherReady = weatherStatus === 'live' || weatherStatus === 'demo';

  const value = useMemo(
    () => ({
      assessmentMetadata,
      flightPlan,
      flightSetup,
      setFlightSetup,
      weatherMode,
      loadDemoScenario,
      useLiveWeather,
      weatherReady,
      missionRule,
      setMissionRule,
      responses,
      setResponses,
      ifrEligibility,
      setIfrEligibility,
      appliedWeatherSignature,
      setAppliedWeatherSignature,
      weatherPicture,
      weatherStatus,
      weatherError,
      assessmentResult,
      aiExplanation,
      aiExplanationStatus,
      requestAiExplanation,
      resetAssessmentState
    }),
    [
      assessmentMetadata,
      flightPlan,
      flightSetup,
      weatherMode,
      missionRule,
      responses,
      ifrEligibility,
      appliedWeatherSignature,
      weatherPicture,
      weatherStatus,
      weatherError,
      weatherReady,
      assessmentResult,
      aiExplanation,
      aiExplanationStatus
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function createDefaultFlightSetup() {
  return {
    departureAirport: '',
    destinationAirport: '',
    plannedDepartureTime: formatCurrentLocalDateTime(),
    cruiseAltitude: '',
    cruiseSpeed: ''
  };
}

function createDemoFlightSetup() {
  return {
    departureAirport: 'KFMY',
    destinationAirport: 'KDAB',
    plannedDepartureTime: formatCurrentLocalDateTime(),
    cruiseAltitude: 8500,
    cruiseSpeed: 125
  };
}

function formatCurrentLocalDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }

  return context;
}

export { AppProvider, useAppContext };
