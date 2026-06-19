const sanitizeURL = (url: string) => url.replace(/\?token=[^&#]+/, '?token=x');

export class HTTPError extends Error {
  url: string;
  status: number;

  /**
   * @param url
   * @param status HTTP status
   */
  constructor(url: string, status: number) {
    super(`Unexpected status ${status} while fetching ${sanitizeURL(url)}`);
    this.name = 'HTTPError';
    this.url = url;
    this.status = status;
  }
}

export class CanNotAccessProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanNotAccessProjectError';
  }
}

/**
 * NOTE: Do NOT use `instanceof AbortError` to detect abort errors.
 * Use `error.name === 'AbortError'` instead.
 */
export class AbortError extends Error {
  constructor(message?: string) {
    super(message || 'The operation was aborted.');
    this.name = 'AbortError';
  }
}
