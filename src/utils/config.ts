import type { FreshRSSConfig } from '../types/index.js';

/**
 * Get configuration from environment variables
 */
export function getConfigFromEnv(): FreshRSSConfig {
  const baseUrl = process.env.FRESHRSS_URL;
  const username = process.env.FRESHRSS_USERNAME;
  const apiPassword = process.env.FRESHRSS_API_PASSWORD;

  if (baseUrl === undefined || baseUrl === '') {
    throw new Error('FRESHRSS_URL environment variable is required');
  }
  if (username === undefined || username === '') {
    throw new Error('FRESHRSS_USERNAME environment variable is required');
  }
  if (apiPassword === undefined || apiPassword === '') {
    throw new Error('FRESHRSS_API_PASSWORD environment variable is required');
  }

  return { baseUrl, username, apiPassword };
}
