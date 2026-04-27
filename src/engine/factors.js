import {
  AIRCRAFT_FACTORS,
  ENVIRONMENT_FACTORS,
  EXTERNAL_PRESSURE_FACTORS,
  PERSONAL_FACTORS
} from '../data/factors.js';

function toQuestionText(label) {
  return `${label}?`;
}

export function buildAssessmentMetadata() {
  return {
    pilot: Object.entries(PERSONAL_FACTORS).map(([label, weights]) => ({
      id: `pilot-${label}`,
      category: 'Pilot',
      label,
      question: toQuestionText(label),
      weights,
      advisoryOnly: false
    })),
    aircraft: Object.entries(AIRCRAFT_FACTORS).map(([label, weights]) => ({
      id: `aircraft-${label}`,
      category: 'Aircraft',
      label,
      question: toQuestionText(label),
      weights,
      advisoryOnly: false
    })),
    environment: Object.entries(ENVIRONMENT_FACTORS).map(([label, weights]) => ({
      id: `environment-${label}`,
      category: 'enVironment',
      label,
      question: toQuestionText(label),
      weights,
      advisoryOnly: false
    })),
    externalPressures: EXTERNAL_PRESSURE_FACTORS.map((label) => ({
      id: `external-${label}`,
      category: 'External Pressures',
      label,
      question: label,
      weights: { VFR: 0, IFR: 0 },
      advisoryOnly: true
    }))
  };
}
