import { fetchWithProxy as fetch } from "./fetch-wrapper.js";
import { HTTPError } from "./errors.js";

// Wrapper around fetch() to make asset downloading more reliable.
//  - Maximum number of concurrent fetch() is limited and queued. Chrome in particular
//    tends to throw errors when you start too many fetch() at once.
//  - Requests are retried with randomized backoff between attempts.
//  - If an asset is determined to not exist, retries are cancelled.
//  - Handles assets.scratch.mit.edu status code quirks.

// Originally based on https://github.com/TurboWarp/scratch-storage/blob/develop/src/safer-fetch.js

let currentFetches = 0;
type PendingFetch = [(value: ArrayBuffer | null | PromiseLike<ArrayBuffer | null>) => void, string, FetchAssetOptions | undefined];
const queue: PendingFetch[] = [];

const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_CONCURRENT = 100;
const RETRY_DELAY = 2000;

const finishedFetch = () => {
  currentFetches--;
  checkStartNextFetch();
};

const startNextFetch = ([resolve, url, options]: PendingFetch) => {
  let firstError: any;
  let attempts = 0;
  const maxAttempts =
    options && typeof options.retries === "number"
      ? options.retries
      : DEFAULT_MAX_ATTEMPTS;

  const attemptToFetch = (): Promise<ArrayBuffer | null> =>
    fetch(url, options)
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
        finishedFetch();
        return buffer;
      })
      .catch((error) => {
        if (error && error.name === "AbortError") {
          // The error we throw here must be an AbortError.
          finishedFetch();
          throw error;
        }

        if (!firstError) {
          firstError = error;
        }

        if (attempts < maxAttempts) {
          attempts++;
          // Concise logging for transient failures
          console.warn(`[retry ${attempts}/${maxAttempts}] Failed to fetch ${url}: ${error.message || error}`);

          return new Promise((cb) =>
            setTimeout(cb, (attempts + Math.random() - 1) * RETRY_DELAY),
          ).then(attemptToFetch);
        }

        console.warn(`Attempt to fetch ${url} failed completely after ${maxAttempts} retries`, error);
        finishedFetch();
        throw new Error(`Failed to fetch ${url} after ${maxAttempts} retries: ${firstError}`);
      });

  return resolve(attemptToFetch());
};

const findNextFetch = (): PendingFetch | null => {
  while (true) {
    if (queue.length === 0) {
      return null;
    }
    const next = queue.shift()!;
    const options = next[2];
    if (options && options.signal && options.signal.aborted) {
      continue;
    }
    return next;
  }
};

const checkStartNextFetch = () => {
  if (currentFetches < MAX_CONCURRENT) {
    const nextFetch = findNextFetch();
    if (nextFetch) {
      currentFetches++;
      startNextFetch(nextFetch);
    }
  }
};

export interface FetchAssetOptions extends RequestInit {
  retries?: number;
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
  if (assetCache.has(url)) {
    return Promise.resolve(assetCache.get(url)!);
  }
  return new Promise((resolve) => {
    queue.push([
      (bufferOrPromise) => {
        if (bufferOrPromise instanceof ArrayBuffer) {
          assetCache.set(url, bufferOrPromise);
        } else if (bufferOrPromise instanceof Uint8Array) {
          // Should be ArrayBuffer from arrayBuffer() call
        }
        resolve(bufferOrPromise);
      },
      url,
      options,
    ]);
    checkStartNextFetch();
  });
};

export default fetchAsset;
