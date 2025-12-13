/**
 * Configuration for connecting to FreshRSS
 */
export interface FreshRSSConfig {
  baseUrl: string;
  username: string;
  apiPassword: string;
}

/**
 * Authentication state
 */
export interface AuthState {
  authToken: string;
  actionToken?: string;
}
