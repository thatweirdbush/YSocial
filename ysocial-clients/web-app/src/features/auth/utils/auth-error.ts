import { isApiError } from "@/lib/api-error";
import type { TranslationKey } from "@/lib/i18n/translate";

const CODE_KEYS: Record<string, TranslationKey> = {
  InvalidCredentials: "auth.errorInvalidCredentials",
  AccountInactive: "auth.errorAccountInactive",
  EmailTaken: "auth.errorEmailTaken",
  UsernameTaken: "auth.errorUsernameTaken",
  InvalidOtp: "auth.errorInvalidOtp",
  OtpAttemptsExceeded: "auth.errorOtpAttemptsExceeded",
  ValidationFailed: "auth.errorValidationFailed",
  BusinessRuleViolated: "auth.errorValidationFailed",
  Unauthenticated: "auth.errorSessionExpired",
  InvalidRefreshToken: "auth.errorSessionExpired",
};

/** Maps a BE error `code` (MAP §1.1) to a user message key; transport failures & unknown codes get generic keys. */
export function authErrorKey(error: unknown): TranslationKey {
  if (!isApiError(error)) return "auth.errorUnexpected";
  if (error.kind === "network") return "auth.errorNetwork";
  return CODE_KEYS[error.code] ?? "auth.errorUnexpected";
}

/** First validation message per field from a ProblemDetails `errors` map; keys use form (camelCase) casing. */
export function authFieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isApiError(error) || !error.errors) return result;
  for (const [field, messages] of Object.entries(error.errors)) {
    const first = messages?.[0];
    if (first) result[field.charAt(0).toLowerCase() + field.slice(1)] = first;
  }
  return result;
}
