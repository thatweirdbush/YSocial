import { beforeEach, describe, expect, it } from "vitest";
import { resetSettingsStore, SETTINGS_STORAGE_KEY, useSettingsStore } from "./settings-store";

const state = () => useSettingsStore.getState();

beforeEach(() => {
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  resetSettingsStore();
});

describe("settings-store", () => {
  it("defaults are md / system / false / false", () => {
    expect(state()).toMatchObject({ fontSize: "md", reducedMotion: "system", hideLikeCounts: false, hideShareCounts: false });
  });

  it("actions write each field independently", () => {
    state().actions.setFontSize("lg");
    state().actions.setReducedMotion("reduce");
    state().actions.setHideLikeCounts(true);
    state().actions.setHideShareCounts(true);

    expect(state()).toMatchObject({ fontSize: "lg", reducedMotion: "reduce", hideLikeCounts: true, hideShareCounts: true });
  });

  it("persists to localStorage without actions", () => {
    state().actions.setFontSize("sm");

    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}") as { state: Record<string, unknown> };
    expect(stored.state).toEqual({ fontSize: "sm", reducedMotion: "system", hideLikeCounts: false, hideShareCounts: false });
  });

  it("skipHydration: first render uses defaults, rehydrate restores values", async () => {
    resetSettingsStore();
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { fontSize: "lg", reducedMotion: "reduce", hideLikeCounts: true, hideShareCounts: false }, version: 0 }),
    );
    expect(state().fontSize).toBe("md");

    await useSettingsStore.persist.rehydrate();

    expect(state()).toMatchObject({ fontSize: "lg", reducedMotion: "reduce", hideLikeCounts: true, hideShareCounts: false });
  });

  it("ignores invalid persisted values (storage is user-editable)", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { fontSize: "huge", reducedMotion: 3, hideLikeCounts: "yes", hideShareCounts: true }, version: 0 }),
    );

    await useSettingsStore.persist.rehydrate();

    expect(state()).toMatchObject({ fontSize: "md", reducedMotion: "system", hideLikeCounts: false, hideShareCounts: true });
  });
});
