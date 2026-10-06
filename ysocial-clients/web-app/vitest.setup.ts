import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Pin UI locale before any store module reads it (jsdom navigator.language is "en-US").
localStorage.setItem("ysocial_locale", "vi");

// jsdom lacks IntersectionObserver (used by infinite scroll); a no-op stub keeps components mountable.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;

// jsdom also lacks ResizeObserver (used by the Saved collection scroller).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
});
