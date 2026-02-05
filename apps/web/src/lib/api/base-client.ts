/**
 * Base HTTP client with shared fetch logic for all domain clients.
 * Provides consistent error handling, URL building, and request methods.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Custom error class for API errors with status code and message.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Base HTTP client that all domain clients extend.
 * Provides consistent request handling, error parsing, and response processing.
 */
export class BaseHttpClient {
  constructor(protected readonly baseUrl: string = API_URL) {}

  /**
   * Core fetch method with error handling and response parsing.
   */
  protected async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let details: unknown;
      try {
        const body = await response.json();
        message = body.message || message;
        details = body;
      } catch {
        // If not JSON, use status text only
      }
      throw new ApiError(response.status, message, details);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * Build URL with query parameters, filtering out undefined values.
   */
  protected buildUrl<P extends object>(path: string, params?: P): string {
    if (!params) return path;

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }

    const query = searchParams.toString();
    return query ? `${path}?${query}` : path;
  }

  /**
   * GET request with optional query parameters.
   */
  protected get<T, P extends object = Record<string, unknown>>(path: string, params?: P): Promise<T> {
    return this.request(this.buildUrl(path, params));
  }

  /**
   * POST request with optional body.
   */
  protected post<T>(path: string, body?: unknown): Promise<T> {
    return this.request(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request with body.
   */
  protected patch<T>(path: string, body: unknown): Promise<T> {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request with body.
   */
  protected put<T>(path: string, body: unknown): Promise<T> {
    return this.request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request.
   */
  protected delete<T>(path: string): Promise<T> {
    return this.request(path, { method: 'DELETE' });
  }
}
