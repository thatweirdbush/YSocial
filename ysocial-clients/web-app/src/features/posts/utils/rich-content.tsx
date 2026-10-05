import Link from "next/link";
import React from "react";
import { HighlightText } from "@/components/shared/highlight-text";
import { HASHTAG_PATTERN, MENTION_PATTERN } from "@/lib/text";

interface RichContentProps {
  content: string;
  /** Normalized search tokens to highlight in plain text segments (never inside links). */
  highlightTokens?: readonly string[];
}

/** Group 1 = hashtag, group 2 = mention username. */
const ENTITY_PATTERN = new RegExp(`${HASHTAG_PATTERN.source}|${MENTION_PATTERN.source}`, "gu");

const LINK_CLASS = "font-medium text-zinc-950 hover:underline dark:text-zinc-50";

// Links sit inside the card's content click target (opens the thread); keep their clicks local.
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

/** Post text with `#tag` -> `/tags/[tag]` and `@username` -> `/@username` links. */
export function RichContent({ content, highlightTokens = [] }: RichContentProps) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  const pushText = (end: number) => {
    if (end > cursor) {
      nodes.push(<HighlightText key={`t${cursor}`} text={content.slice(cursor, end)} tokens={highlightTokens} />);
    }
  };

  for (const match of content.matchAll(ENTITY_PATTERN)) {
    const [text, tag, username] = match;
    pushText(match.index);
    nodes.push(
      <Link
        key={`l${match.index}`}
        href={tag ? `/tags/${encodeURIComponent(tag)}` : `/@${username}`}
        onClick={stopPropagation}
        className={LINK_CLASS}
      >
        {text}
      </Link>,
    );
    cursor = match.index + text.length;
  }
  pushText(content.length);

  return <>{nodes}</>;
}
