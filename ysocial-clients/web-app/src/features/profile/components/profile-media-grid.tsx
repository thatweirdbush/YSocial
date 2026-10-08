"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { useIsDeleted, usePost } from "@/features/posts";
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

  const images = post?.imageUrls?.length ? post.imageUrls : post?.imageUrl ? [post.imageUrl] : [];
  if (!post || isDeleted || images.length === 0) return null;

  const isMulti = images.length > 1;
  const alt = t("profile.mediaAlt", { username });

  return (
    <Link
      href={`/posts/${id}`}
      className="group relative block aspect-square overflow-hidden bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:bg-zinc-900 dark:focus-visible:ring-zinc-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote/blob post images, no next/image remote config (spec D16) */}
      <img
        src={images[0]}
        alt={isMulti ? `${alt} (1/${images.length})` : alt}
        loading="lazy"
        decoding="async"
        className="size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
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
