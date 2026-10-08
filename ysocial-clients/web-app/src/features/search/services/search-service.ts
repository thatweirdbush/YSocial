import { fetchTrendingTags, SEARCH_LIMIT, searchPosts } from "@/features/posts";
import { searchUsers } from "@/features/profile";
import { normalizeText } from "@/lib/text";
import { SEARCH_TABS, type SearchResponse, type SearchSuggestions, type SearchTab } from "../types";

// Orchestrates post & user services for search. Owns no data; swap the underlying services for real APIs.

export const SUGGESTION_LIMIT = 4;

const EMPTY_RESPONSE: SearchResponse = Object.freeze({ users: [], posts: [], latestPosts: [], tags: [] }) as SearchResponse;

/** Query without a leading `#` / `@`, normalized. Empty -> nothing to search. */
export const bareQuery = (query: string) => normalizeText(query.trim().replace(/^[#@]/, ""));

export function resolveDefaultTab(query: string): SearchTab {
  const trimmed = query.trim();
  if (trimmed.startsWith("#")) return "tags";
  if (trimmed.startsWith("@")) return "users";
  return "top";
}

export const isSearchTab = (value: unknown): value is SearchTab => SEARCH_TABS.includes(value as SearchTab);

export function buildSearchHref(query: string, tab?: SearchTab): string {
  const href = `/search?q=${encodeURIComponent(query.trim())}`;
  return tab ? `${href}&tab=${tab}` : href;
}

async function matchingTags(query: string, limit: number) {
  // Tags never contain spaces: "da lat" must match #ĐàLạt
  const bare = bareQuery(query).replace(/ /g, "");
  const tags = await fetchTrendingTags(SEARCH_LIMIT);
  return tags.filter((stat) => normalizeText(stat.tag).includes(bare)).slice(0, limit);
}

export async function fetchSearch(query: string, actorId: string): Promise<SearchResponse> {
  if (!bareQuery(query)) return EMPTY_RESPONSE;

  // Each tab's order comes from the service (real API: a sort param), never re-sorted on the client
  const [users, posts, latestPosts, tags] = await Promise.all([
    searchUsers(query, actorId),
    searchPosts(query, SEARCH_LIMIT, "relevance"),
    searchPosts(query, SEARCH_LIMIT, "latest"),
    matchingTags(query, SEARCH_LIMIT),
  ]);
  return { users, posts, latestPosts, tags };
}

export async function fetchSuggestions(query: string, actorId: string): Promise<SearchSuggestions> {
  if (!bareQuery(query)) return { users: [], tags: [] };

  const [users, tags] = await Promise.all([
    searchUsers(query, actorId, SUGGESTION_LIMIT),
    matchingTags(query, SUGGESTION_LIMIT),
  ]);
  return { users, tags };
}
