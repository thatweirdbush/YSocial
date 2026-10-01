import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Pin UI locale before any store module reads it (jsdom navigator.language is "en-US").
localStorage.setItem("ysocial_locale", "vi");

afterEach(() => {
  cleanup();
});
