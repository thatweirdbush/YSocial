import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSettingsStore, useSettingsStore } from "../store/settings-store";
import { SettingsEffects } from "./settings-effects";

const html = document.documentElement;

beforeEach(() => resetSettingsStore());
afterEach(() => {
  delete html.dataset.fontSize;
  delete html.dataset.motion;
});

describe("SettingsEffects", () => {
  it("sets data-font-size & data-motion on html", () => {
    render(<SettingsEffects />);

    act(() => {
      useSettingsStore.getState().actions.setFontSize("lg");
      useSettingsStore.getState().actions.setReducedMotion("reduce");
    });

    expect(html.dataset.fontSize).toBe("lg");
    expect(html.dataset.motion).toBe("reduce");
  });

  it("system motion removes data-motion (OS media query stays in charge)", () => {
    render(<SettingsEffects />);
    act(() => useSettingsStore.getState().actions.setReducedMotion("reduce"));

    act(() => useSettingsStore.getState().actions.setReducedMotion("system"));

    expect(html.dataset.motion).toBeUndefined();
    expect(html.dataset.fontSize).toBe("md");
  });
});

describe("globals.css motion contract", () => {
  it("every data-motion selector is scoped under html[data-motion=\"reduce\"]", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rules = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((match) => match[1]).filter((selectors) => selectors.includes("data-motion"));

    expect(rules.length).toBeGreaterThan(0);
    const selectors = rules.flatMap((rule) => rule.split(",").map((selector) => selector.trim()));
    expect(selectors.length).toBeGreaterThanOrEqual(3);
    for (const selector of selectors) {
      expect(selector.startsWith('html[data-motion="reduce"]'), selector).toBe(true);
    }
  });
});
