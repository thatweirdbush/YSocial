import type { TranslationKey } from "@/lib/i18n/translate";

import type { MediaRejection } from "./media-limits";

/** Failure of a queued upload (or a refusal before queuing): the codes the UI explains. */
export type MediaProblem = MediaRejection | { code: "busy" } | { code: "unavailable" } | { code: "network" } | { code: "server"; message?: string };

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Plain-language message of a media problem (server text is shown as is when the BE gave one). */
export function describeMediaProblem(problem: MediaProblem, t: Translate): string {
  switch (problem.code) {
    case "unsupported":
      return t("media.unsupported");
    case "tooMany":
      return t("media.tooManyFiles", { n: problem.n });
    case "imageTooBig":
      return t("media.imageTooBig", { n: problem.n });
    case "videoTooBig":
      return t("media.videoTooBig", { n: problem.n });
    case "aggregateTooBig":
      return t("media.aggregateTooBig", { n: problem.n });
    case "busy":
      return t("media.busy");
    case "unavailable":
      return t("media.unavailable");
    case "network":
      return t("media.network");
    case "server":
      return problem.message || t("media.uploadFailed");
  }
}
