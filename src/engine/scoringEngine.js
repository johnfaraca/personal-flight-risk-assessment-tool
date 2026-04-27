import { THRESHOLDS } from '../data/factors';
import { OFFICIAL_WEATHER_GUIDANCE } from '../data/weatherGuidance';

function flattenMetadata(metadata) {
  return [
    ...metadata.pilot,
    ...metadata.aircraft,
    ...metadata.environment,
    ...metadata.externalPressures
  ];
}

export function getInitialResponses(metadata) {
  return flattenMetadata(metadata).reduce((accumulator, item) => {
    accumulator[item.id] = false;
    return accumulator;
  }, {});
}

function scoreForRule(metadata, responses, rule) {
  const items = flattenMetadata(metadata).filter((item) => !item.advisoryOnly);

  const contributions = items
    .filter((item) => responses[item.id])
    .map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      weight: item.weights[rule]
    }))
    .filter((item) => item.weight !== null);

  const score = contributions.reduce((total, item) => total + item.weight, 0);
  const recommendation = THRESHOLDS[rule].find(([limit]) => score <= limit)?.[1] ?? "Don't go";

  return {
    rule,
    score,
    recommendation,
    contributions: contributions.sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
  };
}

export function evaluateAssessment({ missionRule, responses, weatherPicture }) {
  const metadata = weatherPicture.assessmentMetadata;
  const vfrResult = scoreForRule(metadata, responses, 'VFR');
  const shouldAskIfr =
    vfrResult.recommendation !== 'GO';

  const ifrReassessmentUsed = shouldAskIfr && missionRule === 'IFR';
  const finalResult = ifrReassessmentUsed
    ? scoreForRule(metadata, responses, 'IFR')
    : vfrResult;

  const externalPressureFlags = metadata.externalPressures
    .filter((item) => responses[item.id])
    .map((item) => item.label);

  return {
    vfrResult,
    finalResult,
    finalRecommendation: finalResult.recommendation,
    finalScore: finalResult.score,
    scoringPathUsed: ifrReassessmentUsed ? 'VFR reassessment -> IFR' : 'VFR only',
    ifrPromptNeeded: shouldAskIfr,
    ifrReassessmentUsed,
    externalPressureFlags,
    topContributingFactors: finalResult.contributions.slice(0, 5),
    mitigationSuggestions: buildMitigationSuggestions(finalResult, weatherPicture, externalPressureFlags),
    weatherSummary: weatherPicture.summary
  };
}

function buildMitigationSuggestions(result, weatherPicture, externalPressureFlags) {
  const suggestions = [];

  if (shouldShowOfficialWeatherGuidance(weatherPicture)) {
    suggestions.push(OFFICIAL_WEATHER_GUIDANCE);
  }

  if (weatherPicture.hazards.convection.level !== 'None') {
    suggestions.push('Delay departure or choose a route and time window that avoids convective activity.');
  }

  if (weatherPicture.hazards.icing.level !== 'None') {
    suggestions.push('Re-evaluate altitude selection and confirm whether aircraft capability matches the icing risk.');
  }

  if (weatherPicture.hazards.visibility.level !== 'None') {
    suggestions.push('Plan alternates, add fuel margin, and confirm legal visibility and ceiling minimums before departure.');
  }

  if (result.contributions.some((item) => item.label === 'Fatigue (less than normal sleep prior night)')) {
    suggestions.push('Consider delaying until rested or using a more current and rested pilot.');
  }

  if (result.contributions.some((item) => item.label === 'Less than 100 hours in type')) {
    suggestions.push('Reduce complexity: pick a simpler route, fly in better weather, or consult an instructor/mentor.');
  }

  if (externalPressureFlags.length > 0) {
    suggestions.push('Separate schedule pressure from safety by naming clear no-go triggers before the flight.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Keep official weather briefing, performance planning, and personal minimum checks as separate go/no-go gates.');
  }

  return [...new Set(suggestions)].slice(0, 5);
}

function shouldShowOfficialWeatherGuidance(weatherPicture) {
  const advisories = weatherPicture.advisories;
  const advisoryItems = advisories?.items ?? [];

  return Boolean(
    advisories?.officialWeatherGuidance ||
      advisoryItems.some((item) => item.impact === 'advisory-only' || item.officialWeatherGuidance)
  );
}
