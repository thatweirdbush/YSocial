"use client";

import { useEffect } from "react";
import { startUsageTracking } from "../utils/usage-tracker";

/** Records visible-tab time for the time-management section (this device only). */
export function UsageTrackerMount() {
  useEffect(() => startUsageTracking(), []);
  return null;
}
