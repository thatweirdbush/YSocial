---
module: Media (upload, storage, playback, avatar) - design
date: 2026-10-21
---

# Media - design (FE + BE vertical slice, sub-project A of media-discovery)

## 0. Status & intent
- **Status:** IMPLEMENTED; as-built `.context/features/media.md`, deviations in plan mismatch log
- **Depends on:** sub-project B (done, `2026-10-21-discovery-design.md`)
- **Intent:** users upload several images & videos per post & avatar; media lives in Cloudinary behind `IMediaStorage` (swappable); no stock images; Next `Image` renders everything; video sound is session preference applied to next videos scrolled into view; abandoned uploads never pile up in Cloudinary
- **Classification:** vertical (BE-gap-first, then FE)
- **Keys:** `Cloudinary:CloudName|ApiKey|ApiSecret` exist in user-secrets (names checked, values never printed or logged); `appsettings.json` keeps empty strings only
- **Rev 2 changes:** limit arithmetic & resource caps (2.1, 4.2), honest buffering (4.2), write-ahead asset rows replace "orphans accepted" (5), concurrency tokens for attach/claim/quota (3, 5), avatar payloads (2.4), file & URL hardening + EXIF proof (6), health & playback & fallbacks (7, 8)

## 1. Scope

| Item | Outcome |
|---|---|
| Storage abstraction | `IMediaStorage` (Application) + `CloudinaryMediaStorage` (Infrastructure) + `UnavailableMediaStorage` when keys are missing (503, startup never fails, health `Degraded`) |
| Upload | `POST /api/media` multipart, many files, hardened validation, returns `MediaDto[]` (assets `Pending`) |
| No Cloudinary litter | write-ahead rows `Uploading -> Pending -> Attached -> Released`, claim-based deletion, discard endpoint, sweep job, compensation (section 5) |
| Post media | `Post.Media` (max 10 mixed images/videos), `PostDto.media[]`, media-only posts allowed |
| Avatar | `PUT profiles/me` gains `avatarMediaId` with explicit precedence (2.4) |
| Optimization | client WebP compression + Cloudinary incoming limit + delivery `f_auto,q_auto` through Next `Image` loader |
| Playback | `VideoPlayer` with 1 app-wide coordinator, mute toggle = session preference |
| FE | `MediaImage`, `UserAvatar`, grid & lightbox rewrite, `useMediaUploadQueue` hook plugged into composer, edit-profile avatar upload |
| Seed | already free of stock images (sub-project B) |

Out of scope (proposals, register in roadmap): cover upload, alt text, profile Media tab, signed direct-to-Cloudinary upload, end-to-end streaming upload (`MultipartReader`), blurhash/LQIP, video transcoding profile, virus scanning, purge of media of long-deleted posts/accounts, comment media, drag reorder, upload progress bar (spinner only: `fetch` has no progress)

## 2. Contract delta (MAP update first: D33 media, D34 avatar)

### 2.1 `POST /api/media` ([Authorize])
- Request `multipart/form-data`: `files` (1..10), `purpose` = `post` (default) | `avatar`
- `avatar`: exactly 1 file, image only. `post`: images & videos

**Limit arithmetic (single source, all in MiB = 1,048,576 bytes):**

| Limit | Value | Enforced by | Failure |
|---|---|---|---|
| per image | 10 | validator (file length) | 400 `ValidationFailed` `errors.files` |
| per video | 100 | validator | 400 |
| files per request | 10 | validator | 400 |
| **aggregate file bytes per request** | **100** | validator (sum of lengths) | 400 |
| request body cap | **102** (= 100 aggregate + 2 multipart boundaries/headers/fields overhead) | `[RequestSizeLimit]` + `[RequestFormLimits(MultipartBodyLengthLimit)]` on action | 413 `PayloadTooLarge` (Kestrel rejects before binding) |
| pixel count (jpeg/png/gif/webp, from header) | <= 50 MP & each side <= 12000 | validator | 400 |
| video (from Cloudinary response) | <= 4096 px side, <= 10 min | handler, after upload: asset deleted | 400 |
| `Pending`+`Uploading` assets per user | 30 | handler under quota token (3) | 400 |

- Consequence of arithmetic: 10 images (<= 10 each) fit aggregate; 1 video of 100 MiB fits only alone; image + video mixes fit while sum is <= 100 MiB. Global Kestrel body limit stays default (30 MB): only this action is raised
- **Concurrency caps (resource exhaustion):** per user 1 in-flight upload request (process-local gate), per instance `Media:MaxConcurrentUploads` = 4 (non-blocking `Wait(0)`); over either -> 429 `TooManyRequests` with `Retry-After: 5`. Across instances per-user guarantee comes from quota token (3): loser gets 409 `Conflict` (retry)
- Provider-side rejection (Cloudinary size/format error) is mapped to 400 `ValidationFailed`, never 500
- Success 201 `MediaDto[]`: `{ id, kind: image|video, url, posterUrl|null, width, height, durationSeconds|null, bytes }`; `url` = Cloudinary `secure_url` WITHOUT delivery transformation; `posterUrl` videos only
- **All-or-nothing:** any file failing -> files already uploaded in this request are deleted (compensation) & their rows removed
- Storage keys missing or Cloudinary unreachable -> 503 `MediaStorageUnavailable`; anonymous -> 401

### 2.2 `DELETE /api/media/{id}` ([Authorize])
- Discards 1 OWN `Pending` asset: claims it (`Pending -> Deleting`, token-checked), deletes in Cloudinary (not found = success), removes row -> 204. If Cloudinary call fails the row stays `Deleting` (retried by sweep) & answer is STILL 204 (asset is already unusable)
- Foreign, unknown, `Uploading`, `Attached`, `Released`, `Deleting` or already gone -> 404 `NotFound` (1 answer, no id probing)
- FE calls it best-effort when attachment is removed or composer/dialog is discarded

### 2.3 Posts
- `POST /api/posts` body `{ content, imageUrl?, mediaIds?: guid[] }`
  - `mediaIds`: <= 10, distinct (duplicates -> 400), order kept as `Position`. Each must be OWN asset, purpose `post`, status `Pending`, else 404 `NotFound` for whole request (no partial attach). Post insert & all attach transitions happen in 1 `SaveChanges` (1 transaction)
  - Race: 2 requests using same asset -> asset's concurrency token rejects loser -> 409 `Conflict` (retry then answers 404: already attached)
  - `imageUrl` (external, e.g. GIF picker) only without `mediaIds`; with both -> 400. `imageUrl` must NOT be `OwnsUrl` URL of our storage (same guard as avatar)
  - `content` may be empty when at least 1 media or `imageUrl` is present; otherwise required (<= 2000). Same on edit: post with media may be edited to empty text
- `PostDto.media: MediaDto[]` always present (empty array); `imageUrl` stays (first uploaded image url, or external url), omitted when none. FE builds items from `media`, falling back to `imageUrl`
- Media is immutable after create; soft-deleting post keeps its media (restore works)

### 2.4 D34 avatar (`PUT /api/users/profiles/me`)
- Body gains `avatarMediaId?: guid`. REPLACE semantics stay for `displayName`, `bio`, `avatarUrl`, `coverUrl`
- **Exact FE payloads:**

| User action | `avatarMediaId` | `avatarUrl` |
|---|---|---|
| new upload | e new asset id | key NOT sent |
| keep avatar | not sent | current stored url |
| remove avatar | not sent | `null` |
| unrelated edit (name/bio) | not sent | current stored url (never omitted: omission = clear) |

- **Precedence, pinned by tests:**
  1. `avatarMediaId` present -> `avatarUrl` key present (any value, even equal) -> 400 `ValidationFailed` (ambiguous). Otherwise asset must be OWN, purpose `avatar`, kind image, `Pending` (else 404). Avatar becomes asset `url`
  2. `avatarMediaId` absent -> `avatarUrl`: `null`/omitted clears; equal to stored = unchanged; anything else must be external http(s) URL & URL for which `IMediaStorage.OwnsUrl` is true is rejected 400 (our assets enter only through `avatarMediaId`: nobody can point at another user's asset)
  3. Replacing or clearing avatar that was 1 of our assets marks OLD asset `Released`. Old asset is found by `(OwnerId, Purpose=avatar, Status=Attached, Url == old avatar url)` (small set, indexed by owner)
- **Transaction:** profile update + new asset `Attached` + old asset `Released` are 1 `SaveChanges`; token conflicts -> 409. `Released` rows are only deleted later by sweep after grace period (cached UIs keep working), so failed request never loses old avatar

### 2.5 Errors (CodesSnapshot 37 -> 40)
- New: `PayloadTooLarge` 413, `MediaStorageUnavailable` 503, `TooManyRequests` 429. `ApiProblems.CodeFor/TitleFor` gain 3 statuses (otherwise `InternalError`); MAP §1.1, `CodesSnapshot_MatchesApprovedList`, swagger responses updated
- Everything else reuses `ValidationFailed`, `Unauthenticated`, `NotFound`, `Conflict`

### 2.6 Swagger
- `UploadMediaRequest` with `[FromForm]` `IFormFileCollection Files` + `Purpose`, action `[Consumes("multipart/form-data")]`, typed `ProducesResponseType` (201 `MediaDto[]`, 400/401/409/413/429/503 `ProblemDetails`); otherwise generation fails & `Swagger_*` go red. FE copy regenerated (export test, `api:generate`, `api:check`)

## 3. Domain & persistence
- **`MediaAsset` aggregate** (`MediaAssetId`, `IMediaAssetRepository`): `OwnerId`, `Kind` (image 1, video 2), `Purpose` (post 1, avatar 2), `PublicId`, `Url?`, `PosterUrl?`, `Width?`, `Height?`, `DurationSeconds?`, `Bytes?` (null while `Uploading`), `Status`, `CreatedAt`, `StatusChangedAt`, `CleanupAttempts`, `Version`
  - **Status machine:** `Uploading -> Pending -> Attached -> Released`; deletion goes through `Deleting`: `{Uploading (expired), Pending (expired or discarded), Released (grace over)} -> Deleting -> row removed`. `Attached` is never deleted
  - Domain methods: `Create` (Uploading), `MarkUploaded(result)`, `MarkAttached(ownerId)` (rule `MediaMustBePendingForOwnerRule`, Kind NotFound), `Release()`, `Claim(now)` (-> Deleting), `RecordCleanupFailure()`. Each transition bumps `Version`
  - **Concurrency:** `Version` is EF concurrency token, so attach vs sweep claim vs discard vs release are decided by DB: exactly 1 transition wins, loser gets `ConcurrencyConflictException` (-> 409, or handled: sweep skips row, upload compensation continues). Provider-neutral (same idea as `Account.Version`)
  - `PublicId` = `ysocial/{env}/{posts|avatars}/{MediaAssetId:N}`, derived from asset id BEFORE any upload
- **Quota token:** `User` gets shadow int concurrency token `MediaQuotaVersion`; reserve step reads live count (`Uploading` + `Pending`) & bumps token in same save, so 2 concurrent reserves cannot both pass 30 cap (loser: 409, retry)
- **`Post.Media`:** owned collection `PostMedia` (table `PostMedia`, key `(PostId, Position)`) snapshot `{MediaId, Kind, Url, PosterUrl, Width, Height, DurationSeconds}`; always loaded with post (every projection needs it, <= 10 rows). Rule `PostMediaLimitRule` (<= 10), content rule "empty allowed when media"
- Repo members (set-based): `GetByIdsAsync(ids)`, `CountReservedAsync(ownerId)`, `GetSweepBatchAsync(now, batch)`, `GetAttachedAvatarAsync(owner, url)`
- Migration `AddMedia` (+ `MediaQuotaVersion`); `Store` sets; `ModelTests` guard
- No cross-aggregate FK: assets are linked by id only

## 4. Storage & upload mechanics

### 4.1 `IMediaStorage` (Application/Abstractions/Media)
```csharp
Task<StoredMedia> UploadAsync(MediaUpload upload, CancellationToken ct);
Task DeleteAsync(IReadOnlyCollection<StoredMediaRef> refs, CancellationToken ct); // (PublicId, Kind); not found = success
bool OwnsUrl(string url);
```
- `MediaUpload(MediaAssetId Id, MediaKind Kind, MediaPurpose Purpose, string ContentType, Stream Content)`; `StoredMedia(PublicId, Url, PosterUrl?, Width, Height, DurationSeconds?, Bytes, Format)`
- **Cloudinary impl:** images incoming transformation `c_limit,w_2048,h_2048` + `fl_strip_profile` (avatar `c_fill,g_auto,w_512,h_512` + strip), `overwrite=false`, `unique_filename=false`, explicit `resource_type`; videos stored as uploaded, poster = same path `.jpg` with `so_0`. After upload response `resource_type`/`format` must match sniffed kind, else file is deleted & request answers 400
- **`OwnsUrl` is strict (parsed, never prefix/`Contains` check):** `Uri` absolute, scheme `https`, no user-info, default port, host EXACTLY `res.cloudinary.com` (ordinal, lowercase-normalized), first path segment EXACTLY configured cloud name (case-sensitive), second segment `image` or `video`, third `upload`, no `..`/encoded slash/backslash segments. Table-driven tests: `res.cloudinary.com.evil.com`, `https://res.cloudinary.com@evil.com/`, other cloud name, `http://`, uppercase host, userinfo, `%2e%2e`, double slashes, trailing dots, ports
- `UnavailableMediaStorage` when any `Cloudinary:*` value is empty: upload & discard answer 503 (`MediaStorageUnavailableException` -> `GlobalExceptionHandler`); `OwnsUrl` is false; sweep skips with 1 warning per run

### 4.2 Upload pipeline: buffering, temp storage, cancellation (honest)
- **Not end-to-end streaming.** `IFormFile` binding buffers multipart body: up to 64 KiB per file in memory, beyond that in TEMP FILE under `Path.GetTempPath()` BEFORE action runs. Cloudinary upload then reads each part from that temp file (never fully in memory). Therefore worst-case temp disk per instance = `MaxConcurrentUploads` x 102 MiB = about 408 MiB; deployments must provide it (BG deployment note). Temp files are deleted when request ends, also on client abort
- True streaming (`MultipartReader`, validation while reading, no temp file) is DEFERRED upgrade, registered in BG §10 with this reasoning
- **Proxy & server limits (documented in BG §8):** reverse proxy body limit >= 102 MiB (nginx `client_max_body_size 102m`, IIS `maxAllowedContentLength`), read/send timeouts >= 10 min on upload path, request buffering allowed; Kestrel `MinRequestBodyDataRate` stays default (240 B/s) so stalled clients are cut off; Cloudinary SDK timeout 10 min per file
- **Cancellation:** `HttpContext.RequestAborted` flows controller -> MediatR -> `UploadAsync(ct)` (SDK token overload; where SDK offers none, wrap with `Task.WaitAsync(ct)`). When cancelled, compensation uses `CancellationToken.None` with 10 s bound & whatever it cannot finish is finished by sweep (section 5), because write-ahead rows exist

### 4.3 Handler flow (write-ahead)
1. Validate everything cheap first (count, sizes, aggregate, sniff, pixel header)
2. Gates: per-user & per-instance concurrency (429)
3. **Tx 1 (explicit `CommitAsync` inside handler):** read live reserved count, check cap, insert N rows `Uploading` (deterministic `PublicId`), bump `MediaQuotaVersion`
4. Upload files 1 by 1 (bounded by cancellation)
5. **Tx 2:** each row -> `Pending` with url/size/dimensions
6. Any failure in 4-5: claim our own rows (`-> Deleting`), delete uploaded files (not found = success), remove rows; leftovers stay `Deleting`/`Uploading` for sweep
- Crash anywhere leaves DB row BEFORE or WITH remote file, so sweep can always delete by deterministic id: there is no file Cloudinary holds that DB does not know about (unless DB itself is lost)

## 5. No-litter strategy
1. **Write-ahead rows:** DB record always precedes Cloudinary file, so orphan files are impossible without DB loss. This REPLACES rev 1 "prefix reconcile (deferred)" idea; no Admin API listing is needed. Residual risk (DB restore to older point) is registered as accepted debt with manual prefix-listing runbook
2. **Two-phase:** upload gives `Pending`; only post create / avatar update attach
3. **Explicit discard:** `DELETE /api/media/{id}` on remove, composer discard/close, avatar dialog cancel (best effort; page unload uses `keepalive`)
4. **Sweep:** hosted `MediaCleanupJob` every 10 min, batch 50. Eligible: `Uploading` older than 30 min (lease > max upload time), `Pending` older than `Media:PendingTtlHours` (24), `Released` older than `Media:ReleasedGraceMinutes` (60), `Deleting` whose `StatusChangedAt` lease (10 min) expired
5. **Claiming (multi-instance safe):** sweep claims row by transition to `Deleting` under `Version` token; lost race (someone attached it, another instance claimed it) skips row. Then `DeleteAsync` (already missing = success) & only AFTER that the row is removed. Cloudinary failure keeps the row `Deleting` with `CleanupAttempts++`; retried after lease; error log at 10 attempts, never silently dropped
6. **Cap:** <= 30 `Uploading`+`Pending` per user under quota token (concurrent uploads cannot exceed it)
7. **Drafts** do NOT persist uploaded media (TTL would kill them); they keep text & audience
8. **Deferred:** media of soft-deleted posts/accounts stays (restore); purge job registered as debt (BG §10)

## 6. Security & privacy
- **Validation layers:** (1) magic bytes decide kind & mime (header `Content-Type` & file name are never trusted; names never reach `public_id`), (2) header-parsed pixel dimensions for jpeg/png/gif/webp, (3) SVG/HEIC/anything else rejected, (4) Cloudinary response must agree with sniffed kind & stay inside video limits, else delete + 400, (5) images are re-encoded by Cloudinary through incoming transformation, so polyglot payload never reaches delivery as uploaded. Not provided: malware scanning, deep decode of every format (registered debt)
- **URL ownership:** `OwnsUrl` as defined in 4.1, applied to avatar & post `imageUrl`
- **EXIF/GPS:** upload adds `fl_strip_profile` & delivery goes through `f_auto,q_auto`. Claim "metadata is stripped" is VERIFIED, not assumed: real smoke uploads JPEG carrying GPS EXIF, downloads stored asset & delivered variant & checks bytes for EXIF/GPS markers; unit test pins transformation string. If marker survives, flag set is changed before ship & doc says what Cloudinary actually does
- Secrets: Cloudinary keys stay server side (user-secrets), never logged (`LogRedactor` names `secret`, config logging off)

## 7. Runtime behavior
- **Health:** adds `AddHealthChecks()` + `MapHealthChecks("/health")` (anonymous, no details) with check `media-storage`: `Healthy` when configured, `Degraded` ("storage not configured") when `UnavailableMediaStorage` is active (HTTP 200: app still serves everything except media). No outbound call on every probe. Startup logs 1 warning when degraded. Tests pin both states
- **FE on 503:** no preflight; queue shows "upload unavailable" & keeps text posting working
- **`VideoPlayer` coordination (1 app-wide coordinator):** each player reports its visible ratio; player with highest ratio >= 0.6 (tie: topmost) plays, all others pause; pause on `visibilitychange` hidden, on lightbox open, on unmount/route change; user pause sticks until video leaves & re-enters view; `prefers-reduced-motion` -> no autoplay (play button); `playsInline`, `loop`, `preload="metadata"`; `play()` rejection is swallowed & element falls back to muted WITHOUT changing stored preference
- **Mute preference:** `ui-store` `videoMuted` default `true`, session-scoped (not persisted); toggle `aria-pressed`; every player reads it, so videos scrolled into view next follow it
- **Compression fallback (client):** image -> `createImageBitmap(file, { imageOrientation: "from-image" })` (orientation honored) -> canvas `toBlob("image/webp", 0.82)`, longest side <= 2048. Fall back to ORIGINAL file when: type is GIF or animated, source <= 300 KB, WebP encoding unsupported (blob type not `image/webp`), result not smaller than original, decode throws, or it takes longer than 10 s. HEIC/unknown types are rejected before upload with message. Videos are never re-encoded on client
- **Loader (`lib/media/media-loader.ts`):** `isCloudinaryUrl` uses same strict parse as `OwnsUrl` (https, host exactly `res.cloudinary.com`, `/{cloud}/{image|video}/upload/` shape; when `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set cloud must match). Only those URLs are optimized: transformations are inserted right after `/upload/` (before optional `v123/` version), only when no transformation segment exists; `f_auto,q_auto,c_limit,w_{width}`; video poster variant `.jpg`+`so_0`. Everything else (blob:, data:, other Cloudinary clouds, giphy, legacy hosts) renders with `unoptimized` & goes straight to browser: NO `remotePatterns` wildcard (would turn `/_next/image` into open proxy)

## 8. FE (components)
- `MediaImage`, `UserAvatar` (initials underneath, `next/image` on top, hides on error); `AvatarImage` call sites migrate, `components/ui/avatar.tsx` untouched
- `PostMediaGrid` keeps 1/2/3/4+ layouts, boxes from `width/height` (ratio clamped 4:5..16:9, no CLS), `sizes` set, `hover:scale-*` removed; lightbox handles video with controls
- `useMediaUploadQueue` (own file, tested): items `{localId, file, previewUrl, status: compressing|uploading|ready|error, media?}`; sequential `fetch` + FormData (no manual `Content-Type`, same `apiClient` auth & single-flight refresh path, no XHR); `remove` discards on BE when ready; `discardAll`; `mediaIds` for submit; submit blocked while uploading; error items retry/remove; client mirrors limits of 2.1 (including aggregate) so it rarely hits 400/413. Plugged into `PostCreatorCore` through thin adapter, NO refactor of 1300-line component
- Capabilities: `multiImage` always on; new `mediaUpload` on when `content` is real. Mock mode keeps blob previews. Reply composer hides media button in real mode (BE comments carry no media)
- Edit profile: avatar picker (upload on select, preview via `UserAvatar`, remove button) sending payloads of 2.4; close without save discards pending upload
- Mapper/types: `PostItem.media?: PostMediaItem[]`, `toPostItem` maps `media` (fallback `imageUrl`); `CreatePostInput.mediaIds?`; real `createPost` sends `mediaIds` & external `imageUrl` (GIF) only

## 9. Tests
- Domain: `MediaAsset` status machine (every legal/illegal transition), `Post` media/limit/empty-content, `PostMedia` snapshot
- Application (SQLite + `FakeMediaStorage` with fault injection): write-ahead flow (crash after tx 1, after upload, after tx 2 via injected faults: sweep ends clean), compensation, all-or-nothing, quota token race (parallel reserves never exceed 30), attach race (parallel post creates: exactly 1 wins), sweep claim race (attach vs claim, claim vs claim), Cloudinary delete failure keeps `Deleting` & retries, already-missing = success, `LogRedactor` never opens stream
- API integration (fake storage): limit table row by row (incl. aggregate 100 MiB, body cap 413, count, pixel dims), renamed `.exe` as `.png`, SVG/HEIC rejected, foreign/attached/unknown -> 404 everywhere, 429 gates, 503 mapping, avatar payload matrix (2.4) incl. both fields -> 400, spoofed `OwnsUrl` urls rejected on avatar & `imageUrl`, create post with `mediaIds` (order, once only, media-only, edit to empty), `DELETE` rules, health `Healthy`/`Degraded`, swagger pins
- `OwnsUrl` table (section 4.1) in Application tests; loader table in FE tests
- PostgreSQL opt-in: migrations from empty, `MediaAsset` token conflicts on Npgsql, sweep queries. NOT claimed green unless run
- FE: loader, `MediaImage`, grid layouts, `VideoPlayer` (fake IntersectionObserver, coordinator arbitration, play rejection, reduced motion), mute store, compression fallbacks, upload queue (retry, discard, aggregate limit, race), edit-profile payloads, adapters, capability matrix; tests asserting `img src` updated
- **Real smoke (keys in user-secrets):** upload 2 images + 1 video, create post, delivery in browser, remove one, avatar replace, run sweep, prove deletion through Cloudinary Admin API, EXIF/GPS check of stored vs delivered bytes; leftovers & results reported honestly

## 10. Decisions & risks
- **Server-proxy upload with buffered `IFormFile`** (not signed direct, not streaming): 1 place for validation/ownership/`IMediaStorage` swap; costs temp disk & API bandwidth. Upgrade paths: streaming reader, signed direct upload
- **Write-ahead rows** cost 2 commits per upload but make "no orphan file" true by construction
- **Owned `PostMedia` (auto-included)** vs child entity: media is needed by every post projection, hashtags are not
- **Cloudinary limits** (10 MB image / 100 MB video on free plan) match ours; provider rejections are mapped to 400 & re-checked in smoke
- **Real Cloudinary calls only in manual smoke;** tests use fake
- **Mock mode** keeps blob previews, no media endpoints needed
