# Pilot Go/No-Go MVP

Presentation-ready MVP web app for a pilot go/no-go decision-support prototype focused on general aviation preflight risk assessment.

## What it does

- Guides the user through four screens: Flight Setup, Weather Picture, PAVE Assessment, and Results
- Uses a local weather service layer that can return FAA AWC-backed weather and fall back to generated context when needed
- Implements a deterministic scoring engine using the frozen VFR/IFR logic provided
- Runs VFR scoring first, then offers an IFR reassessment gate only when the VFR result is not `GO`
- Keeps External Pressures visible but advisory-only in v1
- Includes a mock AI explanation panel that never calculates scores or overrides the deterministic result

## Important safety note

This prototype is decision-support only. It is not a replacement for:

- official weather briefings
- flight planning
- aircraft performance calculations
- regulations
- pilot judgment

## Stack

- React
- Vite
- React Router
- React state with a small local Node service layer for weather requests

## Getting started

1. Install a current Node.js release if it is not already available.
2. Install dependencies:

```bash
npm install
```

3. Start the development server and local weather service:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## App flow

1. `Flight Setup`
2. `Weather Picture`
3. `PAVE Assessment`
4. `Results`

## Project structure

```text
src/
  components/       Shared UI pieces
  data/             Frozen scoring tables
  engine/           Assessment metadata + deterministic scoring engine
  screens/          Four user-facing screens
  services/         Mock weather + AI explanation integration points
  state/            Shared app state
  utils/            Flight estimation helpers
```

## MVP behavior notes

- Route distance is estimated using airport coordinate heuristics
- Cruise time is estimated from route distance and cruise speed
- A fixed 30-minute operational buffer is added automatically
- ETA is displayed on Flight Setup and reused in Weather Picture
- Mock weather pre-selects a subset of environmental checklist items to make the demo believable

## Integration hooks

### Weather API

The frontend weather layer currently uses `src/services/weatherService.js`, which calls the local server-side weather service.

To swap in live data later:

- keep the returned weather-picture object shape stable so the screens and scoring engine do not need to change
- update the FAA AWC adapter in `server/awcClient.js` and `server/weatherService.js`
- map additional live weather outputs into the hazard summaries and any auto-selected assessment factors

### AI explanation

The AI panel currently uses `src/services/aiExplanationService.js`.

To add a live AI explanation later:

- pass only the deterministic assessment result object into the model prompt
- keep scoring logic entirely outside the model
- treat the model output as optional explanatory text only
- never allow the model to override score, rule path, or final recommendation

## Deterministic scoring implementation

- Frozen factor tables live in `src/data/factors.js`
- Assessment question metadata is generated in `src/engine/factors.js`
- Scoring logic lives in `src/engine/scoringEngine.js`

The scoring engine:

- evaluates VFR first
- stops immediately if VFR returns `GO`
- otherwise supports the exact IFR reassessment gate requested
- excludes `null` weights for rule-specific non-applicable factors
- ignores External Pressures for score totals

## Notes about this environment

The current workspace did not have `node`, `npm`, `pnpm`, `yarn`, or `bun` available, so the app was scaffolded but not executed locally here. Once Node.js is available, `npm install` and `npm run dev` should be the next steps.
