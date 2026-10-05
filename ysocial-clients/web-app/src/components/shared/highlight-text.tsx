import React from "react";
import { foldText } from "@/lib/text";

interface HighlightTextProps {
  text: string;
  /** Normalized tokens (see `tokenize`); empty -> plain text. */
  tokens: readonly string[];
}

type Range = [start: number, end: number];

/** Folds `text` char by char; `starts`/`ends` give each folded char's span in the original string. */
function foldWithSpans(text: string): { folded: string; starts: number[]; ends: number[] } {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = foldText(char);
    for (let i = 0; i < part.length; i++) {
      starts.push(index);
      ends.push(index + char.length);
    }
    folded += part;
    index += char.length;
  }
  return { folded, starts, ends };
}

/** Original-string ranges matching any token, merged & sorted. Plain `indexOf`, so tokens are literal. */
function findRanges(text: string, tokens: readonly string[]): Range[] {
  const { folded, starts, ends } = foldWithSpans(text);
  const ranges: Range[] = [];

  for (const token of tokens) {
    if (!token) continue;
    for (let from = folded.indexOf(token); from !== -1; from = folded.indexOf(token, from + token.length)) {
      let end = ends[from + token.length - 1];
      // Decomposed input: keep trailing combining marks (fold to "") inside the mark
      while (end < text.length && foldText(text[end]) === "") end++;
      ranges.push([starts[from], end]);
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Wraps substrings matching `tokens` (case & diacritics insensitive) in a subtle `<mark>`. */
export function HighlightText({ text, tokens }: HighlightTextProps) {
  const ranges = tokens.length > 0 ? findRanges(text, tokens) : [];
  if (ranges.length === 0) return <>{text}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark key={start} className="rounded-sm bg-zinc-200/70 text-inherit dark:bg-zinc-700/60">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
