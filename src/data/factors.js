export const PERSONAL_FACTORS = {
  'Less than 100 hours in type': { VFR: 2, IFR: 3 },
  'Unfamiliar destination': { VFR: 1, IFR: 2 },
  'Fatigue (less than normal sleep prior night)': { VFR: 2, IFR: 3 },
  'Flight after end of work day': { VFR: 2, IFR: 3 },
  'Scheduled commitment after flight': { VFR: 2, IFR: 2 },
  'Recent death of close family member': { VFR: 2, IFR: 2 },
  'Major domestic problems': { VFR: 2, IFR: 2 },
  'Illness in family': { VFR: 1, IFR: 1 },
  'Second pilot who is rated and current': { VFR: -1, IFR: -1 },
  'Alcohol within the last 24 hours': { VFR: 2, IFR: 2 },
  'Taking over the counter medication': { VFR: 3, IFR: 3 },
  'Inadequate food prior to flight': { VFR: 2, IFR: 2 },
  'Inadequate water prior to flight / no water onboard': { VFR: 2, IFR: 2 },
  'Day > 10,000 ft pressure altitude with no oxygen': { VFR: 2, IFR: 2 },
  'Night > 5,000 ft pressure altitude with no oxygen': { VFR: 3, IFR: 3 },
  'Flight duration greater than 3 hours': { VFR: 2, IFR: 2 }
};

export const AIRCRAFT_FACTORS = {
  'Fuel calculation completed for flight with reserves for day/night conditions': { VFR: -1, IFR: -1 },
  'Total fuel required for flight with reserves for day/night less than 60% available fuel': { VFR: -2, IFR: -3 },
  'Weight & balance calculation made': { VFR: -1, IFR: -1 },
  'Weight within 10% max gross': { VFR: 2, IFR: 2 },
  'Takeoff or landing distance more than 50% of intended runway to be used': { VFR: 2, IFR: 2 }
};

export const ENVIRONMENT_FACTORS = {
  'Visibility 3 to 5 miles': { VFR: 2, IFR: 0 },
  'Visibility 1 to 3 miles': { VFR: 5, IFR: 0 },
  'Destination visibility less than 1 mile': { VFR: 20, IFR: 1 },
  "Ceilings less than 3,000' AGL": { VFR: 3, IFR: 0 },
  'Destination ceilings less than 1,000 feet AGL': { VFR: 10, IFR: 1 },
  'Destination ceilings less than 500 feet AGL': { VFR: 20, IFR: 2 },
  'Convective activity within 20 NM of flight': { VFR: 5, IFR: 3 },
  'Convective activity with no storm scope or other means of detection capability': { VFR: 10, IFR: 3 },
  'Convective activity with detection capability': { VFR: 0, IFR: -2 },
  'Destination dew point spread less than 3°': { VFR: 5, IFR: 1 },
  'No de-icing equipment; surface temp < 40°F and clouds or precipitation': { VFR: 30, IFR: 10 },
  'Icing forecast (AIRMET > light) at required altitude with de-icing equipment': { VFR: null, IFR: 2 },
  'Operational control tower at destination': { VFR: -2, IFR: -2 },
  'VASI/PAPI at destination': { VFR: -1, IFR: -1 },
  'Radar environment at destination': { VFR: -1, IFR: -1 },
  'Mountainous terrain': { VFR: 3, IFR: 3 },
  'Approach/departure over water': { VFR: 1, IFR: 1 },
  'High bird hazard': { VFR: 1, IFR: 1 },
  'Unpaved runway': { VFR: 1, IFR: 1 },
  'IFR and only approach is non-precision': { VFR: null, IFR: 2 },
  'Weather reporting at airport': { VFR: -1, IFR: -1 },
  'Precipitation causing obstruction to visibility': { VFR: 2, IFR: 1 },
  'Wet runway': { VFR: 1, IFR: 1 },
  'Ice on runway': { VFR: 2, IFR: 2 },
  'Crosswind in excess of 90% demonstrated max crosswind in POH': { VFR: 2, IFR: 2 },
  'Using flight following or radar advisories in high density traffic areas': { VFR: -1, IFR: null },
  'On IFR flight plan in VFR conditions': { VFR: -1, IFR: null }
};

export const EXTERNAL_PRESSURE_FACTORS = [
  'Do you feel pressure to depart to keep a personal or business schedule?',
  'Would canceling or delaying this flight create meaningful inconvenience or embarrassment?',
  'Are passengers, customers, or coworkers expecting you to complete this flight today?',
  'Would you be tempted to continue even if conditions deteriorate because of the destination purpose?'
];

export const THRESHOLDS = {
  VFR: [
    [6, 'GO'],
    [10, 'Consider alternate actions'],
    [15, 'Consult CFI'],
    [999999, "Don't go"]
  ],
  IFR: [
    [6, 'GO'],
    [10, 'Consider alternate actions'],
    [15, 'Consult CFI'],
    [999999, "Don't go"]
  ]
};
