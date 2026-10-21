---
module: Discovery (hashtags, trending, tag posts, follow suggestions) - design
date: 2026-10-21
---

# Discovery - design (FE + BE vertical slice, sub-project B of media-discovery)

## 0. Approval & intent
- **Approval:** user delegated design decisions to advisor ("cho advisor think & decide"); advisor approved this spec before code. Recorded here as brainstorming gate outcome
- **Intent:** right panel "Trending" & "Who to follow" run on real BE with rich dev data; trending links (`/tags/[tag]`) resolve on real BE
- **Classification:** vertical (BE-gap-first, then FE real adapters, capability flip)
- Sibling: `2026-10-21-media-design.md` (sub-project A, built after B)

## 1. Scope

| Item | Outcome |
|---|---|
| Hashtag model | `Post.Hashtags` (owned rows `PostHashtags`: `Key` folded, `Display` original casing) set on create & edit by domain parser |
| Trending tags | `GET /api/trending/tags` |
| Tag page | `GET /api/tags/{tag}/posts` (replaces mock `fetchPostsByTag`) |
| Suggestions | `GET /api/users/suggestions` |
| Seed | richer dev data + upgrade stage for already-seeded DBs + stock image removal |
| FE | real adapters `fetchTrendingTags`, `fetchPostsByTag`, `fetchSuggestedUsers`; capabilities `trending`, `tags`, `suggestions` on in every mode |

Out of scope (proposed, register in roadmap): search endpoint (`search` stays BE-less), mentions, hashtag backfill of pre-migration posts, trending cache, ranking by engagement velocity

## 2. Contract delta (MAP update first, D31 & D32)

### 2.0 Viewer identity (all 3 endpoints)
- Authenticated viewer = JWT `user_id` only (`IUserContext.GetViewerId()`); anonymous = `null`
- No endpoint accepts a viewer/actor id (query, header or body). FE adapters ignore their `actorId` argument for real calls
- Access policy, mute & exclusion lists are built from that id only

### 2.1 Hashtag parity (FE `src/lib/text.ts` is the reference)
- Pattern: `#` at start or after whitespace, then 1+ of letters, combining marks, digits, `_` (`(?<=^|\s)#([\p{L}\p{M}\p{N}_]+)`)
- **Key** = fold(tag): NFD, drop `\p{M}`, `đ`/`Đ` -> `d`, lowercase, whitespace collapse n/a (tags have none). Same steps as FE `foldText`. Computed in C# & stored (provider-neutral LINQ)
- **Length unit:** UTF-16 code units of the RAW matched tag (before folding). JS `String.length` & .NET `String.Length` are the same unit. FE has NO limit today: this spec ADDS the same limit to FE `extractHashtags` & linkify so both sides agree (tag longer than 50 = not a tag, left as plain text; FE change in B7). <= 30 distinct tags per post, rest ignored
- Dedupe by key, order of appearance; root posts only (comments carry no tags); edit re-extracts
- **Golden parity fixture:** 1 JSON file (`content` -> `[{key, display}]`) lives in repo, loaded by BE domain tests AND FE vitest, so both reproduce identical output. Cases: casing (`#SAIGON`), NFC vs NFD input, `đ`/`Đ`, stacked combining marks, `_` & digits, `#a-b` / `#a.b` / `#a,b` (punctuation ends tag), `a#b` & URL fragments (not tags), leading/trailing/tab/newline whitespace, lone `#`, 50/51 length boundary, 30/31 tags, astral chars (emoji after tag), non-Latin scripts (Cyrillic, CJK)
- Known engine gaps accepted & pinned by fixture: `\p{L}` Unicode version drift JS vs .NET, `ToLowerInvariant` vs `toLowerCase` on exotic chars (`İ`); a fixture diff = fix before ship
- **Display casing** per tag in a response: most frequent casing among counted posts; tie -> casing used by the newest counted post; tie -> ordinal ascending

### 2.2 D31: trending & tag posts
- `GET /api/trending/tags?limit=` anonymous -> 200 `TrendingTagDto[] { tag, postsCount }`
  - `limit`: integer 1..50, default 5; outside -> 400 `ValidationFailed`. Not paged (top-N list, no `page`)
  - Candidates = non-deleted root posts with tags whose `CreatedAt >= now - window`, filtered by viewer access policy BEFORE counting; `postsCount` = distinct accessible posts carrying the tag IN THE WINDOW
  - **Window fallback (exact):** try 7 days; if distinct visible tags < `limit`, try 30 days; then 365 days. Pick the FIRST window with >= `limit` tags. If none reaches `limit`, use the 365-day result as is (fewer than `limit` items, possibly empty). Clock = injected `TimeProvider` (tests pin it). Response does not state which window was used
  - Order: `postsCount` desc, then `Key` ordinal asc
  - **Not equal to tag page:** trending counts the chosen window only; tag page counts ALL matching visible posts. Same visibility policy, different date scope, so a trending count <= tag page `totalCount` for the same viewer (never greater)
- `GET /api/tags/{tag}/posts?sort=top|latest&page=1&pageSize=10` anonymous -> 200 `TagPostsPageDto = PagedResponse<PostDto> + { tag }`
  - `page` >= 1, `pageSize` 1..50, `sort` default `latest`, unknown sort -> 400; violations -> 400 `ValidationFailed`
  - `{tag}` with or without leading `#`, trimmed; invalid per parser (empty, whitespace inside, > 50 units) -> 400; matching by `Key`
  - Unknown tag or no visible post -> 200, `items` empty, `totalCount` 0, `hasNextPage` false (never 404: tags are not entities); `tag` = echo of input without `#`. Page beyond last -> 200 empty items + real `totalCount`
  - Order of operations: policy filter -> count -> sort -> page. `top` = `likesCount` desc, newest, id asc; `latest` = newest, id asc
  - `tag` field = display casing rule of 2.1 over ALL matching visible posts
- No new error codes

### 2.3 D32: suggestions
- `GET /api/users/suggestions?page=1&pageSize=5` anonymous allowed -> 200 `PagedResponse<UserProfileDto>`; `page` >= 1, `pageSize` 1..50, violations -> 400; page beyond last -> 200 empty + real `totalCount`
- **Candidates:** not deleted, discoverable to viewer (no block either way), not the viewer, not another profile of viewer's account, viewer has no active accepted/pending edge to it, not muted by viewer (dormant mute included)
- **Counts (discoverability):** `followers` = active accepted edges whose OBSERVER is discoverable to viewer; `mutuals` = viewer's active accepted followees who are discoverable to viewer AND have an active accepted edge to the candidate. Blocked/deleted parties never count
- **Score:** `10 * mutuals + min(followers, 50)`. Anonymous: `mutuals` = 0
- **Tie-breakers:** score desc, `User.CreatedAt` desc, `User.Id` asc
- Private profiles included (follow -> pending). Items via `UserProfileProjector`
- Order: candidate filter -> score -> count -> page

## 3. Persistence
- `PostHashtags` table (owned collection of `Post`, key `(PostId, Key)`, `Display` max 50, index on `Key`); migration `AddPostHashtags`
- **NOT auto-included:** feed, thread, saved, profile & write paths never load hashtags. Loaded only via explicit `Include` in: `GetRootPostsByHashtagAsync(key)`, `GetRootPostsWithHashtagsSinceAsync(since)` & `GetByIdWithHashtagsAsync(id)` (used by create/update). Projection of `PostDto` needs none
- **Atomic sync:** hashtag rows are children of the `Post` aggregate: create/edit change them in the SAME `SaveChanges` as content (failed request saves nothing). Edit diffs (remove missing, add new, refresh display of kept). Soft delete keeps rows, every discovery query filters `IsDeleted`; restore needs no resync; no hard post delete exists (cascade on FK if one is added)
- `IUserRepository.GetAllActiveAsync()` (unordered candidates, in-memory scoring) & window aggregation in memory = documented MVP debt (BG §10): bounded by window / user count, no unrelated graphs loaded (users only; posts only with their tags)
- Existing posts get tags only when edited (no backfill: no production data; dev seed adds tagged posts)

## 4. Seed
- `DevelopmentSeeder` stage 1 stops emitting `pravatar`/`picsum` URLs (avatar, cover, post image null)
- Stage 2 `discovery` (own sentinel account `Account(100)`), idempotent (sentinel check, deterministic ids), additive:
  - **Stock cleanup scope:** only rows whose id is a seed id (`SeedIds` ranges) AND whose URL matches a known stock pattern exactly (`https://i.pravatar.cc/150?u=<seed username>`, `https://picsum.photos/seed/<seed username>/1200/400`, `https://picsum.photos/seed/ysocial-<n>/800/600`). User-edited or non-seed rows are never touched
  - adds 18 profiles (3 private), 60+ tagged posts spread over 12 days (8-tag topic cluster, uneven popularity), follow edges with mutuals & uneven follower counts, likes with consistent counters
- Dev DBs seeded before this change get stage 2 on next start (no `database update 0` needed)
- Invariant tests: counters match rows; every tagged seed post's `PostHashtags` equals parser output; second run adds nothing; user-modified avatar survives stage 2

## 5. FE delta
- `post-service.real.ts`: `fetchTrendingTags(limit)`, `fetchPostsByTag(tag, sort, actorId)`; `user-service.real.ts`: `fetchSuggestedUsers(limit, actorId)`; facades dispatch on `isRealApi("content")`
- Mapper tolerates null/absent fields (swagger nullable rule)
- `CAPABILITY_RULES`: `trending`, `tags`, `suggestions` -> always on; `search` stays `unlessContentReal`
- Tag page keeps `TagPage` shape: `postsCount` = `totalCount`; page 1 only (BE paging exposed later: load-more is a follow-up)
- Right panel widgets unchanged (already cached resources); verify in browser against real BE

## 6. Tests
- Domain: golden parity fixture (shared with FE), `Post.Create/UpdateContent` hashtags (survivor/refresh/clear)
- Application/Infra (SQLite): repo round trips with explicit include, model snapshot, seeder idempotency & counters, stage 2 on a stage-1-only DB, stock cleanup scope
- API integration (SQLite): trending (7/30/365 fallback with pinned clock, limit bounds, policy, blocked/private, trending <= tag page), tag posts (sort, ties, paging, beyond-last, unknown tag, diacritics, invalid tag), suggestions (mutual ranking, exclusions, anonymous, ties), viewer identity (client-supplied ids ignored), swagger contract
- **PostgreSQL (provider-specific):** SQLite cannot prove Npgsql behavior (migration SQL, owned collection upsert, collation/case, `timestamptz`). Add an OPT-IN suite `Category=Postgres`, skipped unless env `YSOCIAL_TEST_POSTGRES` holds an admin connection string; each run creates & drops a uniquely named throwaway database (never the dev DB). Covers: apply ALL migrations from empty DB, model has no pending changes, repo queries of this slice (tag lookup, window, include), hashtag edit diff, seeder stages on real provider. Not claimed green unless actually run; real-BE manual smoke on hosted DB remains documented separately (BG §7.3)
- FE: golden fixture parity (`extractHashtags` + new length limit), real adapter + mapper tests, capability matrix

## 7. Decisions & risks
- Viewer-aware trending (not public-only) so a viewer never sees counts from posts they cannot open; counts are window-scoped, tag page is all-time
- In-memory aggregation over window rows: bounded by window, registered as debt (BG §10)
- Fold & parser duplicated FE/BE: shared golden fixture is the guard
- FE gets a small behavior change (50-unit tag limit) to reach parity; mock mode follows it
