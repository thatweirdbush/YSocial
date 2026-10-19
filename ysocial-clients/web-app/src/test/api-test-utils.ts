import { afterEach } from "vitest";

export interface MockStep {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  reject?: Error;
}

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Fetch fake answering with `steps` in order; records every call. Exhausted steps throw. */
export function mockFetchSequence(steps: MockStep[]): { fetchFn: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const step = steps[index++];
    if (!step) throw new Error(`mockFetchSequence: no step for call #${index}`);
    if (step.reject) throw step.reject;
    const hasBody = step.body !== undefined && step.status !== 204;
    const headers = new Headers(step.headers);
    if (hasBody && !headers.has("content-type")) headers.set("content-type", "application/json");
    const payload = hasBody ? (typeof step.body === "string" ? step.body : JSON.stringify(step.body)) : null;
    return new Response(payload, { status: step.status, headers });
  }) as typeof fetch;
  return { fetchFn, calls };
}

/** ProblemDetails step (`application/problem+json`) with a stable `code`. */
export function problem(status: number, code: string, extra: object = {}): MockStep {
  return {
    status,
    body: { type: "about:blank", title: code, status, code, ...extra },
    headers: { "content-type": "application/problem+json" },
  };
}

/** `navigator.locks` stand-in: callbacks sharing a name run FIFO, one at a time. */
export function createLockFake(): LockManagerLike {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const tail = tails.get(name) ?? Promise.resolve();
      const run = tail.then(callback, callback);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}

/** jsdom never delivers `storage` events across documents: fire one by hand. */
export function dispatchStorage(key: string, newValue: string | null, oldValue: string | null = null): void {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue, oldValue }));
}

const SLICES_ENV = "NEXT_PUBLIC_REAL_API_SLICES";
const originalSlices = process.env[SLICES_ENV];

/** Sets (or clears with `undefined`) the slice env; restored after each test. */
export function setRealSlices(list: string | undefined): void {
  if (list === undefined) delete process.env[SLICES_ENV];
  else process.env[SLICES_ENV] = list;
}

afterEach(() => {
  if (originalSlices === undefined) delete process.env[SLICES_ENV];
  else process.env[SLICES_ENV] = originalSlices;
});
