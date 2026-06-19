import environment from './environment.js';

environment.canAccessScratchAPI = true;

// The version here should be incremented if our traffic pattern ever changes significantly
environment.headers['user-agent'] = 'sc-dlp/1.0 (+https://github.com/sc-dlp/sc-dlp)';

export * from './downloader.js';
