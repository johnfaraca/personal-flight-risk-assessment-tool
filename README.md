# Personal Flight Risk Assessment Tool

An educational MVP and decision-support prototype for structured preflight risk review. The app helps a pilot organize risk factors before a flight by walking through flight setup, weather context, PAVE factors, deterministic scoring, advisories, and optional AI-supported discussion.

“This project uses deterministic scoring first and AI-supported discussion second. The AI chat is supplemental and does not calculate, override, or authorize the final recommendation.”

Deterministic scoring first; AI discussion second.

## Problem Addressed

Pilots need structured support for organizing preflight risk factors before making operational decisions. This prototype focuses on pilot condition, aircraft status, weather and environmental context, route complexity, and external pressures so those considerations can be reviewed consistently instead of informally.

Decision-support only — not a substitute for official briefings, flight planning, performance calculations, regulations, or pilot judgment.

## How It Works

1. Landing page: introduces the assessment flow and provides access to the general safety chat.
2. Flight setup: collects route, timing, altitude, and cruise speed inputs.
3. Weather Picture: requests and summarizes weather, airport, route, and advisory context.
4. PAVE Assessment: presents structured risk questions and pre-filled weather or airport factors where available.
5. Results: displays the deterministic recommendation, score details, risk drivers, and mitigation prompts.
6. Advisories and Notices: shows applicable FAA weather advisory and NOTAM-related context, including advisory-only items.
7. Discuss This Result with AI: opens an IBM watsonx Orchestrate chat with assessment context for supplemental discussion.
8. General Safety Chat: provides a separate general aviation safety discussion mode without requiring a completed result.

## What Is PAVE?

PAVE is an aviation risk-management framework:

- Pilot
- Aircraft
- enVironment
- External pressures

The app uses PAVE to structure the assessment flow and help users review human, aircraft, environmental, and pressure-related factors before interpreting the final result.

## Responsible AI Design

The recommendation is produced by deterministic scoring logic. AI is supplemental and is used only to help discuss completed results, risk drivers, and mitigation ideas.

AI does not calculate scores, override deterministic outcomes, authorize flight decisions, or make go/no-go decisions. The app also separates general safety chat from result-specific AI discussion so broad aviation questions and assessment-context discussion remain distinct experiences.

## Weather and Advisory Note

The app uses FAA Aviation Weather Center data where available, including server-side requests for aviation weather products. Some advisories may be shown as advisory-only when they do not cleanly map to scored risk factors. NOTAM parsing may be unavailable depending on the data returned by FAA NOTAM Search.

Users must verify official weather, NOTAMs, and flight conditions separately through approved aviation sources before making operational decisions.

## Privacy Note

This prototype does not include user accounts, payment processing, or intentional collection or storage of personally identifiable information. Browser session storage may temporarily hold current assessment data so the result-specific AI discussion can receive the active assessment context during the session.

Embedded AI chat may process user messages and assessment context through IBM watsonx Orchestrate. Users should not enter sensitive personal, credential, medical, or private aircraft ownership information.

## Tech Stack

- React
- Vite
- React Router
- React Icons
- Node.js HTTP server for local app serving and API routes
- Server API routes for airport lookup, weather picture generation, and AI explanation availability
- FAA Aviation Weather Center data integration for METAR, TAF, station, airport, G-AIRMET, and SIGMET/AIRMET data
- FAA NOTAM Search integration with best-effort parsing
- IBM watsonx Orchestrate embedded chat
- Browser session storage for temporary assessment discussion context

## Setup and Run

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build through the Node server:

```bash
npm run preview
```

The local server defaults to `http://localhost:5173` unless `PORT` is set.

## Screenshots

### Landing page

Screenshot placeholder.

### Weather Picture

Screenshot placeholder.

### PAVE Assessment

Screenshot placeholder.

### Results

Screenshot placeholder.

### AI discussion

Screenshot placeholder.

## Future Improvements

- Server-side persisted assessment context
- OpenAPI tool for assessment context retrieval
- Improved NOTAM parsing
- Expanded aircraft and performance checks
- More robust deployment monitoring

## License

This project is licensed under the MIT License. See the LICENSE file for details.
