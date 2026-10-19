"use client";

import { Construction } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { EmptyState } from "./empty-state";

/** Placeholder for routes of a feature the real BE does not serve yet (see `lib/capabilities`). */
export function FeatureUnavailable() {
  const { t } = useTranslation();
  return <EmptyState icon={Construction} title={t("common.featureUnavailable")} description={t("common.featureUnavailableDesc")} />;
}
