/**
 * OAuth Flow - Trusted device OAuth flow for secure authentication
 *
 * Implements the device code OAuth flow for secure authentication without
 * exposing tokens to the terminal.
 */

import { logger } from '../utils/logger.js';

export interface OAuthConfig {
  client_id: string;
  client_secret?: string;
  auth_url: string;
  token_url: string;
  scope?: string;
  device_code_endpoint?: string;
  token_refresh_threshold_ms?: number;
}

/**
 * OAuthConfig with all required fields
 */
export interface OAuthConfigRequired {
  client_id: string;
  client_secret: string;
  auth_url: string;
  token_url: string;
  scope: string;
  device_code_endpoint: string;
  token_refresh_threshold_ms: number;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth state
 */
export enum OAuthState {
  IDLE = 'idle',
  AUTHORIZATION_PENDING = 'authorization_pending',
  AUTHORIZED = 'authorized',
  TOKEN_EXCHANGED = 'token_exchanged',
  REFRESHING = 'refreshing',
  FAILED = 'failed',
}

/**
 * OAuth tokens
 */
export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

/**
 * OAuth Flow for device code authentication
 */
export class OAuthFlow {
  private config: Required<OAuthConfig>;
  private state: OAuthState = OAuthState.IDLE;
  private deviceCode: string | null = null;
  private userCode: string | null = null;
  private verificationUri: string | null = null;
  private pollIntervalMs: number = 5000;
  private tokens: OAuthTokens | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;

  // Event handlers
  private onUserCode?: (code: string, verificationUri: string) => void;
  private onStateChange?: (state: OAuthState) => void;
  private onTokens?: (tokens: OAuthTokens) => void;
  private onError?: (error: Error) => void;

  constructor(config: OAuthConfig) {
    this.config = {
      client_id: config.client_id,
      client_secret: config.client_secret ?? '',
      auth_url: config.auth_url,
      token_url: config.token_url,
      scope: config.scope ?? 'read write',
      device_code_endpoint: config.device_code_endpoint ?? `${config.auth_url}/device`,
      token_refresh_threshold_ms: config.token_refresh_threshold_ms ?? 60000, // Refresh 1 minute before expiry
    };
  }

  /**
   * Start the OAuth flow - initiates device code flow
   */
  async start(): Promise<{ userCode: string; verificationUri: string }> {
    this.setState(OAuthState.AUTHORIZATION_PENDING);

    try {
      // Request device code
      const deviceCodeResponse = await this.requestDeviceCode();

      this.deviceCode = deviceCodeResponse.device_code;
      this.userCode = deviceCodeResponse.user_code;
      this.verificationUri = deviceCodeResponse.verification_uri;
      this.pollIntervalMs = deviceCodeResponse.interval * 1000;

      // Notify UI of user code
      if (this.onUserCode) {
        this.onUserCode(
          this.userCode,
          deviceCodeResponse.verification_uri_complete || this.verificationUri,
        );
      }

      logger.info(
        { userCode: this.userCode, verificationUri: this.verificationUri },
        'OAuth device code flow initiated',
      );

      // Start polling for authorization
      await this.pollForAuthorization(deviceCodeResponse.expires_in);

      return { userCode: this.userCode, verificationUri: this.verificationUri };
    } catch (error) {
      this.setState(OAuthState.FAILED);
      if (this.onError) {
        this.onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * Cancel the OAuth flow
   */
  async cancel(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.stopRefreshTimer();
    this.setState(OAuthState.IDLE);
    logger.info('OAuth flow cancelled');
  }

  /**
   * Refresh the access token
   */
  async refreshToken(): Promise<OAuthTokens> {
    const currentTokens = this.tokens;
    if (!currentTokens || !currentTokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    this.setState(OAuthState.REFRESHING);

    try {
      const response = await this.requestTokenRefresh(currentTokens.refresh_token);

      this.tokens = {
        access_token: response.access_token,
        refresh_token: response.refresh_token ?? currentTokens.refresh_token,
        expires_at: Date.now() + response.expires_in * 1000,
        token_type: response.token_type,
        scope: response.scope ?? '',
      };

      const tokensCopy = this.tokens;
      this.scheduleRefresh(tokensCopy.expires_at);
      this.setState(OAuthState.TOKEN_EXCHANGED);

      if (this.onTokens) {
        this.onTokens(tokensCopy);
      }

      logger.info('OAuth tokens refreshed');
      return tokensCopy;
    } catch (error) {
      this.setState(OAuthState.FAILED);
      throw error;
    }
  }

  /**
   * Get current tokens
   */
  getTokens(): OAuthTokens | null {
    return this.tokens;
  }

  /**
   * Get current state
   */
  getState(): OAuthState {
    return this.state;
  }

  /**
   * Check if tokens are valid (not expired)
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.expires_at > Date.now();
  }

  /**
   * Set user code handler
   */
  onUserCodeHandler(handler: (code: string, verificationUri: string) => void): void {
    this.onUserCode = handler;
  }

  /**
   * Set state change handler
   */
  onStateChangeHandler(handler: (state: OAuthState) => void): void {
    this.onStateChange = handler;
  }

  /**
   * Set tokens handler
   */
  onTokensHandler(handler: (tokens: OAuthTokens) => void): void {
    this.onTokens = handler;
  }

  /**
   * Set error handler
   */
  onErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  /**
   * Request device code from authorization server
   */
  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      scope: this.config.scope,
    });

    if (this.config.client_secret) {
      params.append('client_secret', this.config.client_secret);
    }

    const response = await fetch(this.config.device_code_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Device code request failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as DeviceCodeResponse;
    return data;
  }

  /**
   * Poll for authorization completion
   */
  private async pollForAuthorization(expiresIn: number): Promise<void> {
    const startTime = Date.now();
    const expiresAt = startTime + expiresIn * 1000;

    this.abortController = new AbortController();

    while (Date.now() < expiresAt) {
      try {
        await this.sleep(this.pollIntervalMs);

        const response = await this.requestTokenGrant();

        if (response) {
          this.setState(OAuthState.AUTHORIZED);

          this.tokens = {
            access_token: response.access_token,
            refresh_token: response.refresh_token ?? '',
            expires_at: Date.now() + response.expires_in * 1000,
            token_type: response.token_type,
            scope: response.scope ?? '',
          };

          const tokensCopy = this.tokens;
          this.scheduleRefresh(tokensCopy.expires_at);
          this.setState(OAuthState.TOKEN_EXCHANGED);

          if (this.onTokens) {
            this.onTokens(tokensCopy);
          }

          logger.info('OAuth authorization completed');
          return;
        }
      } catch (error) {
        const err = error as Error;
        if (err.message?.includes('authorization_pending')) {
          // Still waiting, continue polling
          continue;
        }
        if (err.message?.includes('expired_token')) {
          throw new Error('Authorization timed out');
        }
        throw error;
      }
    }

    throw new Error('Authorization request timed out');
  }

  /**
   * Request token grant from authorization server
   */
  private async requestTokenGrant(): Promise<TokenResponse | null> {
    const currentDeviceCode = this.deviceCode;
    if (!currentDeviceCode) {
      throw new Error('No device code available');
    }

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: currentDeviceCode,
      client_id: this.config.client_id,
    });

    if (this.config.client_secret) {
      params.append('client_secret', this.config.client_secret);
    }

    const response = await fetch(this.config.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (response.status === 200) {
      const data = await response.json() as TokenResponse;
      return data;
    }

    if (response.status === 400) {
      const errorData = await response.json() as { error?: string; error_description?: string };
      if (errorData.error === 'authorization_pending') {
        return null;
      }
      if (errorData.error === 'expired_token') {
        throw new Error('expired_token');
      }
      throw new Error(errorData.error_description || errorData.error);
    }

    throw new Error(`Token grant request failed: ${response.status}`);
  }

  /**
   * Request token refresh
   */
  private async requestTokenRefresh(refreshToken: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.client_id,
    });

    if (this.config.client_secret) {
      params.append('client_secret', this.config.client_secret);
    }

    const response = await fetch(this.config.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as TokenResponse;
    return data;
  }

  /**
   * Schedule token refresh before expiry
   */
  private scheduleRefresh(expiresAt: number): void {
    this.stopRefreshTimer();

    const refreshTime = expiresAt - this.config.token_refresh_threshold_ms;
    const delay = Math.max(refreshTime - Date.now(), 0);

    if (delay > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken().catch((error) => {
          logger.error({ error: error.message }, 'Token refresh failed');
        });
      }, delay);
    }
  }

  /**
   * Stop refresh timer
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Set OAuth state
   */
  private setState(state: OAuthState): void {
    if (this.state !== state) {
      this.state = state;
      this.onStateChange?.(state);
      logger.debug({ state }, 'OAuth state changed');
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default OAuthFlow;