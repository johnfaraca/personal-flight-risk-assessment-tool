const NOTAM_BASE_URL = 'https://notams.aim.faa.gov/notamSearch/';

export async function fetchAirportNotams(airportCode) {
  const normalizedAirportCode = normalizeAirportCode(airportCode);

  if (!normalizedAirportCode) {
    return {
      status: 'unavailable',
      items: [],
      note: 'Destination airport is unavailable, so NOTAM retrieval was skipped.'
    };
  }

  const url = new URL(NOTAM_BASE_URL);
  url.searchParams.set('method', 'displayByICAOs');
  url.searchParams.set('reportType', 'RAW');
  url.searchParams.set('formatType', 'DOMESTIC');
  url.searchParams.set('retrieveLocId', normalizedAirportCode);
  url.searchParams.set('actionType', 'notamRetrievalByICAOs');

  let response;

  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'pilot-go-no-go-mvp/0.1 (server-side FAA NOTAM proxy)'
      }
    });
  } catch (error) {
    return {
      status: 'unavailable',
      items: [],
      note: `FAA NOTAM Search did not respond for ${normalizedAirportCode}.`,
      details: { cause: error.message, url: url.toString() }
    };
  }

  if (!response.ok) {
    return {
      status: 'unavailable',
      items: [],
      note: `FAA NOTAM Search returned HTTP ${response.status} for ${normalizedAirportCode}.`,
      details: { status: response.status, url: url.toString() }
    };
  }

  const pageText = await response.text();
  const rawReport = extractRawReport(pageText);

  if (!rawReport) {
    return {
      status: 'unavailable',
      items: [],
      note:
        'NOTAM data could not be parsed for this run, so NOTAM-based risk-factor mapping is unavailable.',
      details: { url: url.toString() }
    };
  }

  return {
    status: 'live',
    items: parseRawNotamReport(rawReport, normalizedAirportCode),
    note: `NOTAMs loaded from FAA NOTAM Search for ${normalizedAirportCode}.`
  };
}

function extractRawReport(pageText) {
  const preMatch = pageText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);

  if (!preMatch) {
    return '';
  }

  return decodeHtml(preMatch[1]).trim();
}

function parseRawNotamReport(rawReport, airportCode) {
  const normalizedReport = rawReport.replace(/\r/g, '');
  const entries = normalizedReport
    .split(/\n(?=!)/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.map((rawText, index) => ({
    id: `${airportCode}-notam-${index}`,
    airportCode,
    rawText,
    startTime: parseNotamStart(rawText),
    endTime: parseNotamEnd(rawText)
  }));
}

function parseNotamStart(rawText) {
  const dateMatch = rawText.match(/\b(\d{10})-(\d{10}|PERM|WIE)\b/i);
  return dateMatch ? parseNotamDate(dateMatch[1]) : null;
}

function parseNotamEnd(rawText) {
  const dateMatch = rawText.match(/\b(\d{10})-(\d{10}|PERM|WIE)\b/i);

  if (!dateMatch) {
    return null;
  }

  if (dateMatch[2] === 'PERM' || dateMatch[2] === 'WIE') {
    return null;
  }

  return parseNotamDate(dateMatch[2]);
}

function parseNotamDate(value) {
  const year = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const hour = Number(value.slice(6, 8));
  const minute = Number(value.slice(8, 10));
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  const parsed = Date.UTC(fullYear, month - 1, day, hour, minute);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeAirportCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}
