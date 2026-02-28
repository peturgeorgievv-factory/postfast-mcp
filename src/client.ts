const DEFAULT_BASE_URL = 'https://api.postfa.st';

export class PostFastClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.POSTFAST_API_KEY ?? '';
    this.baseUrl = (process.env.POSTFAST_API_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );

    if (!this.apiKey) {
      throw new Error(
        'POSTFAST_API_KEY environment variable is required. Generate one in PostFast → Workspace Settings → API Key.',
      );
    }
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {
      'pf-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      let message: string;

      try {
        const json = JSON.parse(text);
        message = json.message ?? json.error ?? text;
      } catch {
        message = text;
      }

      throw new Error(`PostFast API error (${response.status}): ${message}`);
    }

    const text = await response.text();
    if (!text) return undefined as T;

    return JSON.parse(text) as T;
  }

  get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
