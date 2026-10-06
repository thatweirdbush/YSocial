/**
 * Single scroll owner for the feed. The feed scrolls the DOCUMENT (MainLayout `main` has no overflow);
 * if the layout ever moves to a scroll container, change only this function.
 */
export function scrollFeedToTop(): void {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
}
