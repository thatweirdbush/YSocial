import { Lock } from "lucide-react";
import { describe, expect, it } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import { SETTINGS_SECTIONS, visibleSections } from "./constants";
import type { SettingsSection } from "./types";

const sections: SettingsSection[] = [
  { href: "/settings/always", titleKey: "settings.privacy", icon: Lock },
  { href: "/settings/account", titleKey: "settings.privacy", icon: Lock, capability: "accountUi" },
];

describe("visibleSections", () => {
  it("shows a section without capability in mock mode, hides an accountUi one", () => {
    setRealSlices("");

    expect(visibleSections(sections).map((section) => section.href)).toEqual(["/settings/always"]);
  });

  it("shows both once the auth slice is real", () => {
    setRealSlices("auth");

    expect(visibleSections(sections).map((section) => section.href)).toEqual(["/settings/always", "/settings/account"]);
  });

  it("defaults to the registered settings sections", () => {
    setRealSlices(undefined);

    expect(visibleSections()).toEqual([...SETTINGS_SECTIONS]);
  });
});
