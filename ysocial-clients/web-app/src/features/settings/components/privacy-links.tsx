"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type TranslationKey, useTranslation } from "@/hooks/use-translation";
import { type Capability, hasCapability } from "@/lib/capabilities";

const LINKS: ReadonlyArray<{ href: string; label: TranslationKey; capability: Capability }> = [
  { href: "/settings/blocked", label: "settings.blocked", capability: "blockUi" },
  { href: "/settings/close-friends", label: "settings.closeFriends", capability: "closeFriendsUi" },
];

/** Entries from the privacy page to the lists that belong to it; a link disappears with its capability. */
export function PrivacyLinks() {
  const { t } = useTranslation();
  const links = LINKS.filter(({ capability }) => hasCapability(capability));
  if (links.length === 0) return null;

  return (
    <nav aria-label={t("settings.privacyLinks")} className="border-t border-zinc-200/60 dark:border-zinc-900/60">
      <h2 className="px-4 pt-4 pb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("settings.privacyLinks")}</h2>
      <ul>
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:text-zinc-50 dark:hover:bg-zinc-900/40"
            >
              <span className="flex-1">{t(label)}</span>
              <ChevronRight className="size-4 text-zinc-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
