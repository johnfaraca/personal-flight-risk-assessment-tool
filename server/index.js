import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupAirports } from './airportService.js';
import { buildWeatherPictureFromFlightSetup } from './weatherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 5173;

let vite;

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    root: projectRoot,
    appType: 'custom',
    server: {
      middlewareMode: true
    }
  });
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (requestUrl.pathname === '/api/airport-lookup') {
      const airportLookup = await lookupAirports({
        departureAirport: requestUrl.searchParams.get('departureAirport'),
        destinationAirport: requestUrl.searchParams.get('destinationAirport')
      });

      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(airportLookup));
      return;
    }

    if (requestUrl.pathname === '/api/weather-picture') {
      try {
        const weatherPicture = await buildWeatherPictureFromFlightSetup({
          departureAirport: requestUrl.searchParams.get('departureAirport'),
          destinationAirport: requestUrl.searchParams.get('destinationAirport'),
          plannedDepartureTime: requestUrl.searchParams.get('plannedDepartureTime'),
          cruiseAltitude: requestUrl.searchParams.get('cruiseAltitude'),
          cruiseSpeed: requestUrl.searchParams.get('cruiseSpeed')
        });

        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(weatherPicture));
      } catch (error) {
        console.error('[weather-proxy] request failed', {
          code: error.code || 'unknown',
          message: error.message,
          details: error.details || null
        });

        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(
          JSON.stringify({
            error: 'weather_unavailable',
            code: error.code || 'bad_proxy_response',
            message: `FAA AWC live weather is unavailable. ${error.message}`,
            details: error.details || null
          })
        );
      }
      return;
    }

    if (requestUrl.pathname === '/api/ai-explanation' && request.method === 'POST') {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify({
          error: 'ai_unavailable',
          message:
            'Live AI explanation is not configured for this prototype. The deterministic score and recommendation remain available.'
        })
      );
      return;
    }

    if (!isProduction && vite && shouldServeAppShell(request, requestUrl.pathname)) {
      const indexTemplate = await readFile(path.join(projectRoot, 'index.html'), 'utf-8');
      const transformedHtml = await vite.transformIndexHtml(requestUrl.pathname, indexTemplate);

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(transformedHtml);
      return;
    }

    if (!isProduction && vite) {
      vite.middlewares(request, response, (error) => {
        if (error) {
          response.statusCode = 500;
          response.end(error.message);
        }
      });
      return;
    }

    await serveStaticAsset(requestUrl.pathname, response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        error: 'server_error',
        message: error.message
      })
    );
  }
});

process.stdout.write(
  `Starting Pilot Go/No-Go server with NODE_ENV=${process.env.NODE_ENV ?? 'unset'} PORT=${
    process.env.PORT ?? 'unset'
  }\n`
);

server.on('error', (error) => {
  process.stderr.write(`Pilot Go/No-Go server failed to start: ${error.stack || error.message}\n`);
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Pilot Go/No-Go server listening on http://0.0.0.0:${port}\n`);
});

async function serveStaticAsset(pathname, response) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const absolutePath = path.resolve(distRoot, requestedPath);

  if (absolutePath.startsWith(distRoot) && existsSync(absolutePath) && requestedPath !== 'index.html') {
    response.writeHead(200, { 'Content-Type': contentTypeForPath(absolutePath) });
    createReadStream(absolutePath).pipe(response);
    return;
  }

  const indexHtml = await readFile(path.join(distRoot, 'index.html'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(indexHtml);
}

function contentTypeForPath(filePath) {
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }

  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }

  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }

  if (filePath.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  if (filePath.endsWith('.ico')) {
    return 'image/x-icon';
  }

  return 'application/octet-stream';
}

function shouldServeAppShell(request, pathname) {
  if (request.method !== 'GET') {
    return false;
  }

  if (pathname === '/') {
    return true;
  }

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/node_modules/')
  ) {
    return false;
  }

  if (path.extname(pathname) !== '') {
    return false;
  }

  const acceptHeader = request.headers.accept ?? '';
  return acceptHeader.includes('text/html');
}
