---
module: Discovery (trending tags, tag page, who to follow) - as-built
updated: 2026-10-21
spec: docs/specs/2026-10-21-discovery-design.md
---

# DISCOVERY

- Contract (endpoints, DTOs, ranking, D31 & D32): MAP §2.9 | BE behavior: `backend-guide.md` §7.3 & §10 #31-32 | domain: `domain-model.md` §5.3
- **Scope:** right panel `TrendingWidget` & `FollowSuggestions`, search landing, `/tags/[tag]` run on real BE; mock adapters stay for mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`)

## 1. Flow

| UI | Service | Real endpoint |
|---|---|---|
| `TrendingWidget`, `explore-landing`, search tag matches | `fetchTrendingTags(limit)` | `GET /api/trending/tags?limit` |
| `/tags/[tag]` (`TagContainer`) | `fetchPostsByTag(tag, sort, actorId)` | `GET /api/tags/{tag}/posts?sort&page=1&pageSize=50` |
| `FollowSuggestions`, explore people | `fetchSuggestedUsers(limit, actorId)` | `GET /api/users/suggestions?page=1&pageSize=limit` |

- Facades dispatch on `isRealApi("content")`; `*.real.ts` adapters never send `actorId` (viewer = JWT)
- Capabilities: `trending` & `tags` always on; `suggestions` follows graph rule (`unlessGraphPending`: follow buttons need real ids)

## 2. Design decisions
- **Parity by fixture:** hashtag parser exists twice (BE `HashtagParser`, FE `lib/text.ts`); both read `docs/fixtures/hashtag-parity.json` in tests. Fixture change/diff = fix before ship
- **FE behavior change:** tag longer than 50 UTF-16 units is plain text (no link), at most 30 distinct tags per post (`MAX_HASHTAG_LENGTH`, `MAX_HASHTAGS_PER_POST`); mock mode follows it
- **Counts:** trending = window count (7/30/365 days, first window with enough tags), tag page = all-time visible count, so trending <= tag page. Both use viewer access policy before counting
- **Tag page = first page only** (50 posts, newest/top); BE already pages: load-more is follow-up
- **Invalid tag in URL:** BE 400 is shown as empty tag page (same as unknown tag), not error state
- **SEO:** real mode metadata has no post count (viewer-scoped count is unknown on server); mock mode keeps mock count
- **Dev data:** `DiscoverySeeder` (BG §7.3) gives trending uneven topic mix & suggestions mutuals; applies on already-seeded DBs at next API start

## 3. Pitfalls & verification
- `UpdatePost` MUST load post with `GetByIdWithHashtagsAsync`: editing post loaded without its tag rows would duplicate or drop them
- Real-BE smoke (Development, hosted PostgreSQL, migration + stage 2 seed applied): trending, tag page (`ĐàLạt` via URL-encoded & `dalat`), suggestions, 400 for `a-b`; browser: right panel shows `Who to follow` (3) & `Trending` (`#SaiGon`, `#ĐàLạt`, `#MinimalDesign`), client navigation from trending tag renders 26 posts
- Browser caveat: with app window hidden, hard loads of any route did not hydrate in Browser pane (environmental, home & client navigation fine); not reproduced as app bug
- PostgreSQL opt-in tests exist (`PostgresTests`, env `YSOCIAL_TEST_POSTGRES`) but were NOT run here (no local PostgreSQL/Docker); provider behavior was verified by manual smoke above

## 4. Deferred
- Search endpoint & mentions (search stays BE-less), tag page load-more, trending cache/SQL aggregation (BG §10 #31), hashtag backfill (#32), per-tag follow
