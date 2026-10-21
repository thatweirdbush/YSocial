"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { MediaImage } from "@/components/shared/media-image";
import { mediaItemsOf, useIsDeleted, usePost } from "@/features/posts";
import { posterOf } from "@/lib/media/media-loader";
import { useTranslation } from "@/hooks/use-translation";

interface ProfileMediaGridProps {
  ids: readonly string[];
  username: string;
}

/** 3-column square grid of posts that carry images; each tile opens the post detail. */
export function ProfileMediaGrid({ ids, username }: ProfileMediaGridProps) {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {ids.map((id) => (
        <MediaTile key={id} id={id} username={username} />
      ))}
    </div>
  );
}

function MediaTile({ id, username }: { id: string; username: string }) {
  const { t } = useTranslation();
  const post = usePost(id);
  const isDeleted = useIsDeleted(id);

  const items = post ? mediaItemsOf(post) : [];
  if (!post || isDeleted || items.length === 0) return null;

  const first = items[0];
  const cover = first.kind === "video" ? (first.posterUrl ?? posterOf(first.url)) : first.url;
  if (!cover) return null;

  const isMulti = items.length > 1;
  const alt = t("profile.mediaAlt", { username });

  return (
    <Link
      href={`/posts/${id}`}
      className="group relative block aspect-square overflow-hidden bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:bg-zinc-900 dark:focus-visible:ring-zinc-100"
    >
      <MediaImage src={cover} alt={isMulti ? `${alt} (1/${items.length})` : alt} fill sizes="(min-width: 640px) 200px, 33vw" className="object-cover" />
      {isMulti && (
        <span
          role="img"
          aria-label={t("profile.mediaMulti")}
          className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <Layers className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}
