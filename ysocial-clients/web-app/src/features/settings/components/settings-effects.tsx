"use client";

import { useLayoutEffect } from "react";
import { useFontSize, useReducedMotion } from "../store/settings-store";

/** Mirrors the appearance preferences onto `<html>` (`data-font-size`, `data-motion`); `globals.css` maps them. */
export function SettingsEffects() {
  const fontSize = useFontSize();
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
  }, [fontSize]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (reducedMotion === "reduce") {
      root.dataset.motion = "reduce";
    } else {
      delete root.dataset.motion;
    }
  }, [reducedMotion]);

  return null;
}
