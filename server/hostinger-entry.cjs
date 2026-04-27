console.log('Loading Pilot Go/No-Go server through Hostinger CommonJS wrapper...');

import('./index.js').catch((error) => {
  console.error('Failed to load Pilot Go/No-Go server:', error);
  process.exit(1);
});
