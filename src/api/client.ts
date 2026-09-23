/**
 * A pretend network layer. There is no backend: every call waits a little,
 * occasionally fails, and hands back a copy of the data so callers can never
 * mutate the "server" state. Tests switch the delay and failures off.
 */

export type ApiErrorCode =
  | 'NETWORK'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PAYMENT_DECLINED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED';

const STATUS: Record<ApiErrorCode, number> = {
  NETWORK: 0,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  PAYMENT_DECLINED: 402,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export interface ApiConfig {
  /** Each call waits a random time between these bounds, in milliseconds. */
  latency: { min: number; max: number };
  /** Chance (0 to 1) that a call fails with a network error. */
  failureRate: number;
  /** Source of randomness, swappable for deterministic tests. */
  random: () => number;
}

const DEFAULT_CONFIG: ApiConfig = {
  latency: { min: 250, max: 700 },
  failureRate: 0,
  random: Math.random,
};

let config: ApiConfig = { ...DEFAULT_CONFIG };

export function configureApi(overrides: Partial<ApiConfig>) {
  config = { ...config, ...overrides };
}

export function resetApiConfig() {
  config = { ...DEFAULT_CONFIG };
}

export function getApiConfig(): Readonly<ApiConfig> {
  return config;
}

/**
 * Reads ?latency=1500 and ?fail=0.3 from a query string, so a developer can
 * try loading and error states in the browser.
 */
export function configureApiFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const latency = Number(params.get('latency'));
  const fail = Number(params.get('fail'));
  if (params.has('latency') && Number.isFinite(latency) && latency >= 0) {
    configureApi({ latency: { min: latency, max: latency } });
  }
  if (params.has('fail') && Number.isFinite(fail) && fail >= 0 && fail <= 1) {
    configureApi({ failureRate: fail });
  }
}

function abortError(): DOMException {
  return new DOMException('The request was cancelled.', 'AbortError');
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    if (ms <= 0) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Runs a handler as if it were a network request: waits, may fail, honours
 * cancellation, and returns a deep copy of the result.
 */
export async function simulateRequest<T>(handler: () => T | Promise<T>, { signal }: RequestOptions = {}): Promise<T> {
  const { latency, failureRate, random } = config;
  const delay = latency.min + random() * Math.max(0, latency.max - latency.min);
  await wait(Math.round(delay), signal);

  if (failureRate > 0 && random() < failureRate) {
    throw new ApiError('NETWORK', "We couldn't reach the shop. Check your connection and try again.");
  }

  return structuredClone(await handler());
}
