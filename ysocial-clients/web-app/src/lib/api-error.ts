export type ApiErrorKind = "network" | "http";

interface ApiErrorInit {
  kind: ApiErrorKind;
  status: number;
  code: string;
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
  traceId?: string;
  cause?: unknown;
}

/** Typed failure of a BE call: ProblemDetails (MAP §1) or a transport failure. Switch on `code`, not `message`. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: Record<string, string[]>;
  readonly traceId?: string;

  constructor(init: ApiErrorInit) {
    super(init.detail ?? init.title ?? init.code, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.errors = init.errors;
    this.traceId = init.traceId;
  }
}

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** Builds an `ApiError` from a non-ok response; non-JSON or code-less bodies resolve to `code: "Unknown"`. */
export async function parseProblem(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(await response.text());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  const errors = body?.errors && typeof body.errors === "object" ? (body.errors as Record<string, string[]>) : undefined;
  return new ApiError({
    kind: "http",
    status: response.status,
    code: asString(body?.code) ?? "Unknown",
    title: asString(body?.title),
    detail: asString(body?.detail),
    errors,
    traceId: asString(body?.traceId),
  });
}

/** Transport failure (offline, CORS, TLS, DNS): no HTTP status exists. */
export function networkError(cause: unknown): ApiError {
  return new ApiError({ kind: "network", status: 0, code: "Network", cause });
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

export const hasCode = (value: unknown, code: string): boolean => isApiError(value) && value.code === code;
