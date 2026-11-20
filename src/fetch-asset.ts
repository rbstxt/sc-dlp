import { fetchWithProxy as fetch } from "./fetch-wrapper.js";
import { AbortError, HTTPError } from "./errors.js";

// Wrapper around fetch() to make asset downloading more reliable.
//  - Maximum number of concurrent fetch() is limited and queued. Chrome in particular
//    tends to throw errors when you start too many fetch() at once.
//  - Requests are retried with randomized backoff between attempts.
//  - If an asset is determined to not exist, retries are cancelled.
//  - Handles assets.scratch.mit.edu status code quirks.

// Originally based on https://github.com/TurboWarp/scratch-storage/blob/develop/src/safer-fetch.js

let currentFetches = 0;
type PendingFetch = [
  (value: ArrayBuffer | null | PromiseLike<ArrayBuffer | null>) => void,
  (reason?: any) => void,
  string,
  FetchAssetOptions | undefined
];
const queue: PendingFetch[] = [];

const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_CONCURRENT = 100;
const RETRY_DELAY = 2000;

const sleepWithAbort = (ms: number, signal?: AbortSignal | null): Promise<void> => {
  if (signal?.aborted) {
    return Promise.reject(new AbortError());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
};

const finishedFetch = () => {
  currentFetches--;
  checkStartNextFetch();
};

const startNextFetch = ([resolve, reject, url, options]: PendingFetch) => {
  let firstError: any;
  let attempts = 0;
  const maxAttempts =
    options && typeof options.retries === "number"
      ? options.retries
      : DEFAULT_MAX_ATTEMPTS;

  const { retries: _retries, onWarning, ...fetchOptions } = options || {};
  const warn = (msg: string, err?: any) => {
    if (onWarning) {
      onWarning(msg);
    } else if (err !== undefined) {
      console.warn(msg, err);
    } else {
      console.warn(msg);
    }
  };

  const attemptToFetch = (): Promise<ArrayBuffer | null> =>
    fetch(url, fetchOptions)
      .then((res) => {
        if (res.ok) {
          return res.arrayBuffer();
        }

        // Don't retry if the asset doesn't exist.
        // assets.scratch.mit.edu returns 503 instead of 404 for unknown assets for unknown reasons.
        // eg. https://assets.scratch.mit.edu/00000000000000000000000000000000.png
        if (res.status === 404 || res.status === 503) {
          return null;
        }

        throw new HTTPError(url, res.status);
      })
      .then((buffer) => {
        if (buffer instanceof ArrayBuffer) {
          assetCache.set(url, buffer);
        }
        return buffer;
      })
      .catch((error) => {
        if (error && error.name === "AbortError") {
          // The error we throw here must be an AbortError.
          throw error;
        }

        if (!firstError) {
          firstError = error;
        }

        if (attempts < maxAttempts) {
          attempts++;
          warn(`[retry ${attempts}/${maxAttempts}] Failed to fetch ${url}: ${error?.message || error}`);

          return sleepWithAbort(
            (attempts + Math.random() - 1) * RETRY_DELAY,
            fetchOptions.signal
          ).then(attemptToFetch);
        }

        warn(`Attempt to fetch ${url} failed completely after ${maxAttempts} retries`, error);
        throw new Error(`Failed to fetch ${url} after ${maxAttempts} retries: ${firstError}`);
      });

  attemptToFetch().finally(finishedFetch).then(resolve, reject);
};

const findNextFetch = (): PendingFetch | null => {
  while (true) {
    if (queue.length === 0) {
      return null;
    }
    const next = queue.shift()!;
    const options = next[3];
    if (options && options.signal && options.signal.aborted) {
      next[1](new AbortError());
      continue;
    }
    return next;
  }
};

const checkStartNextFetch = () => {
  while (currentFetches < MAX_CONCURRENT) {
    const nextFetch = findNextFetch();
    if (!nextFetch) {
      break;
    }
    currentFetches++;
    startNextFetch(nextFetch);
  }
};

export interface FetchAssetOptions extends RequestInit {
  retries?: number;
  onWarning?: (message: string) => void;
}

const assetCache = new Map<string, ArrayBuffer>();

export const clearAssetCache = () => {
  assetCache.clear();
};

/**
 * @param url
 * @param options
 * @returns ArrayBuffer if loaded. null if does not exist. Rejects if unexpected error.
 */
const fetchAsset = (url: string, options?: FetchAssetOptions): Promise<ArrayBuffer | null> => {
  if (options?.signal?.aborted) {
    return Promise.reject(new AbortError());
  }
  if (assetCache.has(url)) {
    return Promise.resolve(assetCache.get(url)!);
  }
  return new Promise((resolve, reject) => {
    const entry: PendingFetch = [resolve, reject, url, options];
    queue.push(entry);

    if (options?.signal) {
      const onAbort = () => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) {
          queue.splice(idx, 1);
          reject(new AbortError());
        }
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    checkStartNextFetch();
  });
};

export default fetchAsset;
