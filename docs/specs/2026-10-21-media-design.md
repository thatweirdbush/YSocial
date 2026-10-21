---
module: Media (upload, storage, playback, avatar) - design
date: 2026-10-21
revision: 2 (after user review of rev 1)
---

# Media - design (FE + BE vertical slice, sub-project A of media-discovery)

## 0. Status & intent
- **Status:** DRAFT rev 2, awaiting user review (same gate as spec B). No code before approval
- **Depends on:** sub-project B (done, `2026-10-21-discovery-design.md`)
- **Intent:** users upload several images & videos per post and an avatar; media lives in Cloudinary behind `IMediaStorage` (swappable); no stock images; Next `Image` renders everything; video sound is a session preference applied to the next videos scrolled into view; abandoned uploads never pile up in Cloudinary
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
| Optimization | client WebP compression + Cloudinary incoming limit + delivery `f_auto,q_auto` through a Next `Image` loader |
| Playback | `VideoPlayer` with one app-wide coordinator, mute toggle = session preference |
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
| request body cap | **102** (= 100 aggregate + 2 multipart boundaries/headers/fields overhead) | `[RequestSizeLimit]` + `[RequestFormLimits(MultipartBodyLengthLimit)]` on the action | 413 `PayloadTooLarge` (Kestrel rejects before binding) |
| pixel count (jpeg/png/gif/webp, from header) | <= 50 MP and each side <= 12000 | validator | 400 |
| video (from Cloudinary response) | <= 4096 px side, <= 10 min | handler, after upload: asset deleted | 400 |
| `Pending`+`Uploading` assets per user | 30 | handler under quota token (3) | 400 |

- Consequence of the arithmetic: 10 images (<= 10 each) fit the aggregate; 1 video of 100 MiB fits only alone; image + video mixes fit while the sum is <= 100 MiB. Global Kestrel body limit stays default (30 MB): only this action is raised
- **Concurrency caps (resource exhaustion):** per user 1 in-flight upload request (process-local gate), per instance `Media:MaxConcurrentUploads` = 4 (non-blocking `Wait(0)`); over either -> 429 `TooManyRequests` with `Retry-After: 5`. Across instances the per-user guarantee comes from the quota token (3): loser gets 409 `Conflict` (retry)
- Provider-side rejection (Cloudinary size/format error) is mapped to 400 `ValidationFailed`, never 500
- Success 201 `MediaDto[]`: `{ id, kind: image|video, url, posterUrl|null, width, height, durationSeconds|null, bytes }`; `url` = Cloudinary `secure_url` WITHOUT delivery transformation; `posterUrl` videos only
- **All-or-nothing:** any file failing -> files already uploaded in this request are deleted (compensation) and their rows removed
- Storage keys missing or Cloudinary unreachable -> 503 `MediaStorageUnavailable`; anonymous -> 401

### 2.2 `DELETE /api/media/{id}` ([Authorize])
- Discards one OWN `Pending` asset: claims it (`Pending -> Deleting`, token-checked), deletes in Cloudinary (not found = success), removes the row -> 204. If the Cloudinary call fails the row stays `Deleting` (retried by the sweep) and the answer is STILL 204 (asset is already unusable)
- Foreign, unknown, `Uploading`, `Attached`, `Released`, `Deleting` or already gone -> 404 `NotFound` (one answer, no id probing)
- FE calls it best-effort when an attachment is removed or the composer/dialog is discarded

### 2.3 Posts
- `POST /api/posts` body `{ content, imageUrl?, mediaIds?: guid[] }`
  - `mediaIds`: <= 10, distinct (duplicates -> 400), order kept as `Position`. Each must be an OWN asset, purpose `post`, status `Pending`, else 404 `NotFound` for the whole request (no partial attach). Post insert and all attach transitions happen in ONE `SaveChanges` (one transaction)
  - Race: two requests using the same asset -> the asset's concurrency token rejects the loser -> 409 `Conflict` (a retry then answers 404: already attached)
  - `imageUrl` (external, e.g. GIF picker) only without `mediaIds`; with both -> 400. `imageUrl` must NOT be an `OwnsUrl` URL of our storage (same guard as avatar)
  - `content` may be empty when at least 1 media or `imageUrl` is present; otherwise required (<= 2000). Same on edit: a post with media may be edited to empty text
- `PostDto.media: MediaDto[]` always present (empty array); `imageUrl` stays (first uploaded image url, or the external url), omitted when none. FE builds items from `media`, falling back to `imageUrl`
- Media is immutable after create; soft-deleting a post keeps its media (restore works)

### 2.4 D34 avatar (`PUT /api/users/profiles/me`)
- Body gains `avatarMediaId?: guid`. REPLACE semantics stay for `displayName`, `bio`, `avatarUrl`, `coverUrl`
- **Exact FE payloads:**

| User action | `avatarMediaId` | `avatarUrl` |
|---|---|---|
| new upload | the new asset id | key NOT sent |
| keep avatar | not sent | the current stored url |
| remove avatar | not sent | `null` |
| unrelated edit (name/bio) | not sent | the current stored url (never omitted: omission = clear) |

- **Precedence, pinned by tests:**
  1. `avatarMediaId` present -> `avatarUrl` key present (any value, even equal) -> 400 `ValidationFailed` (ambiguous). Otherwise asset must be OWN, purpose `avatar`, kind image, `Pending` (else 404). Avatar becomes the asset `url`
  2. `avatarMediaId` absent -> `avatarUrl`: `null`/omitted clears; equal to stored = unchanged; anything else must be an external http(s) URL, and a URL for which `IMediaStorage.OwnsUrl` is true is rejected 400 (our assets enter only through `avatarMediaId`: nobody can point at another user's asset)
  3. Replacing or clearing an avatar that was one of our assets marks the OLD asset `Released`. The old asset is found by `(OwnerId, Purpose=avatar, Status=Attached, Url == old avatar url)` (small set, indexed by owner)
- **Transaction:** profile update + new asset `Attached` + old asset `Released` are ONE `SaveChanges`; token conflicts -> 409. `Released` rows are only deleted later by the sweep after a grace period (cached UIs keep working), so a failed request never loses the old avatar

### 2.5 Errors (CodesSnapshot 37 -> 40)
- New: `PayloadTooLarge` 413, `MediaStorageUnavailable` 503, `TooManyRequests` 429. `ApiProblems.CodeFor/TitleFor` gain the three statuses (otherwise `InternalError`); MAP §1.1, `CodesSnapshot_MatchesApprovedList`, swagger responses updated
- Everything else reuses `ValidationFailed`, `Unauthenticated`, `NotFound`, `Conflict`

### 2.6 Swagger
- `UploadMediaRequest` with `[FromForm]` `IFormFileCollection Files` + `Purpose`, action `[Consumes("multipart/form-data")]`, typed `ProducesResponseType` (201 `MediaDto[]`, 400/401/409/413/429/503 `ProblemDetails`); otherwise generation fails and `Swagger_*` go red. FE copy regenerated (export test, `api:generate`, `api:check`)

## 3. Domain & persistence
- **`MediaAsset` aggregate** (`MediaAssetId`, `IMediaAssetRepository`): `OwnerId`, `Kind` (image 1, video 2), `Purpose` (post 1, avatar 2), `PublicId`, `Url?`, `PosterUrl?`, `Width?`, `Height?`, `DurationSeconds?`, `Bytes?` (null while `Uploading`), `Status`, `CreatedAt`, `StatusChangedAt`, `CleanupAttempts`, `Version`
  - **Status machine:** `Uploading -> Pending -> Attached -> Released`; deletion goes through `Deleting`: `{Uploading (expired), Pending (expired or discarded), Released (grace over)} -> Deleting -> row removed`. `Attached` is never deleted
  - Domain methods: `Create` (Uploading), `MarkUploaded(result)`, `MarkAttached(ownerId)` (rule `MediaMustBePendingForOwnerRule`, Kind NotFound), `Release()`, `Claim(now)` (-> Deleting), `RecordCleanupFailure()`. Each transition bumps `Version`
  - **Concurrency:** `Version` is an EF concurrency token, so attach vs sweep claim vs discard vs release are decided by the database: exactly one transition wins, the loser gets `ConcurrencyConflictException` (-> 409, or handled: sweep skips the row, upload compensation continues). Provider-neutral (same idea as `Account.Version`)
  - `PublicId` = `ysocial/{env}/{posts|avatars}/{MediaAssetId:N}`, derived from the asset id BEFORE any upload
- **Quota token:** `User` gets a shadow int concurrency token `MediaQuotaVersion`; the reserve step reads the live count (`Uploading` + `Pending`) and bumps the token in the same save, so two concurrent reserves cannot both pass the 30 cap (loser: 409, retry)
- **`Post.Media`:** owned collection `PostMedia` (table `PostMedia`, key `(PostId, Position)`) snapshot `{MediaId, Kind, Url, PosterUrl, Width, Height, DurationSeconds}`; always loaded with the post (every projection needs it, <= 10 rows). Rule `PostMediaLimitRule` (<= 10), content rule "empty allowed when media"
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
- **Cloudinary impl:** images incoming transformation `c_limit,w_2048,h_2048` + `fl_strip_profile` (avatar `c_fill,g_auto,w_512,h_512` + strip), `overwrite=false`, `unique_filename=false`, explicit `resource_type`; videos stored as uploaded, poster = same path `.jpg` with `so_0`. After upload the response `resource_type`/`format` must match the sniffed kind, else the file is deleted and the request answers 400
- **`OwnsUrl` is strict (parsed, never a prefix/`Contains` check):** `Uri` absolute, scheme `https`, no user-info, default port, host EXACTLY `res.cloudinary.com` (ordinal, lowercase-normalized), first path segment EXACTLY the configured cloud name (case-sensitive), second segment `image` or `video`, third `upload`, no `..`/encoded slash/backslash segments. Table-driven tests: `res.cloudinary.com.evil.com`, `https://res.cloudinary.com@evil.com/`, other cloud name, `http://`, uppercase host, userinfo, `%2e%2e`, double slashes, trailing dots, ports
- `UnavailableMediaStorage` when any `Cloudinary:*` value is empty: upload & discard answer 503 (`MediaStorageUnavailableException` -> `GlobalExceptionHandler`); `OwnsUrl` is false; sweep skips with one warning per run

### 4.2 Upload pipeline: buffering, temp storage, cancellation (honest)
- **Not end-to-end streaming.** `IFormFile` binding buffers the multipart body: up to 64 KiB per file in memory, beyond that in a TEMP FILE under `Path.GetTempPath()` BEFORE the action runs. The Cloudinary upload then reads each part from that temp file (never fully in memory). Therefore worst-case temp disk per instance = `MaxConcurrentUploads` x 102 MiB = about 408 MiB; deployments must provide it (BG deployment note). Temp files are deleted when the request ends, also on client abort
- True streaming (`MultipartReader`, validation while reading, no temp file) is the DEFERRED upgrade, registered in BG §10 with this reasoning
- **Proxy & server limits (documented in BG §8):** reverse proxy body limit >= 102 MiB (nginx `client_max_body_size 102m`, IIS `maxAllowedContentLength`), read/send timeouts >= 10 min on the upload path, request buffering allowed; Kestrel `MinRequestBodyDataRate` stays default (240 B/s) so stalled clients are cut off; Cloudinary SDK timeout 10 min per file
- **Cancellation:** `HttpContext.RequestAborted` flows controller -> MediatR -> `UploadAsync(ct)` (SDK token overload; where the SDK offers none, wrap with `Task.WaitAsync(ct)`). When cancelled, compensation uses `CancellationToken.None` with a 10 s bound, and whatever it cannot finish is finished by the sweep (section 5), because write-ahead rows exist

### 4.3 Handler flow (write-ahead)
1. Validate everything cheap first (count, sizes, aggregate, sniff, pixel header)
2. Gates: per-user & per-instance concurrency (429)
3. **Tx 1 (explicit `CommitAsync` inside the handler):** read live reserved count, check cap, insert N rows `Uploading` (deterministic `PublicId`), bump `MediaQuotaVersion`
4. Upload files one by one (bounded by cancellation)
5. **Tx 2:** each row -> `Pending` with url/size/dimensions
6. Any failure in 4-5: claim our own rows (`-> Deleting`), delete uploaded files (not found = success), remove rows; leftovers stay `Deleting`/`Uploading` for the sweep
- A crash anywhere leaves a DB row BEFORE or WITH the remote file, so the sweep can always delete by the deterministic id: there is no file Cloudinary holds that the database does not know about (unless the database itself is lost)

## 5. No-litter strategy
1. **Write-ahead rows:** the database record always precedes the Cloudinary file, so orphan files are impossible without a database loss. This REPLACES the rev 1 "prefix reconcile (deferred)" idea; no Admin API listing is needed. Residual risk (DB restore to an older point) is registered as accepted debt with a manual prefix-listing runbook
2. **Two-phase:** upload gives `Pending`; only post create / avatar update attach
3. **Explicit discard:** `DELETE /api/media/{id}` on remove, composer discard/close, avatar dialog cancel (best effort; page unload uses `keepalive`)
4. **Sweep:** hosted `MediaCleanupJob` every 10 min, batch 50. Eligible: `Uploading` older than 30 min (lease > max upload time), `Pending` older than `Media:PendingTtlHours` (24), `Released` older than `Media:ReleasedGraceMinutes` (60), `Deleting` whose `StatusChangedAt` lease (10 min) expired
5. **Claiming (multi-instance safe):** the sweep claims a row by transition to `Deleting` under the `Version` token; a lost race (someone attached it, another instance claimed it) skips the row. Then `DeleteAsync` (already missing = success) and only AFTER that the row is removed. A Cloudinary failure keeps the row `Deleting` with `CleanupAttempts++`; retried after the lease; error log at 10 attempts, never silently dropped
6. **Cap:** <= 30 `Uploading`+`Pending` per user under the quota token (concurrent uploads cannot exceed it)
7. **Drafts** do NOT persist uploaded media (the TTL would kill them); they keep text & audience
8. **Deferred:** media of soft-deleted posts/accounts stays (restore); purge job registered as debt (BG §10)

## 6. Security & privacy
- **Validation layers:** (1) magic bytes decide the kind & mime (header `Content-Type` and file name are never trusted; names never reach `public_id`), (2) header-parsed pixel dimensions for jpeg/png/gif/webp, (3) SVG/HEIC/anything else rejected, (4) Cloudinary response must agree with the sniffed kind & stay inside the video limits, else delete + 400, (5) images are re-encoded by Cloudinary through the incoming transformation, so a polyglot payload never reaches delivery as uploaded. Not provided: malware scanning, deep decode of every format (registered debt)
- **URL ownership:** `OwnsUrl` as defined in 4.1, applied to avatar & post `imageUrl`
- **EXIF/GPS:** upload adds `fl_strip_profile` and delivery goes through `f_auto,q_auto`. The claim "metadata is stripped" is VERIFIED, not assumed: the real smoke uploads a JPEG carrying GPS EXIF, downloads the stored asset and a delivered variant and checks the bytes for EXIF/GPS markers; a unit test pins the transformation string. If a marker survives, the flag set is changed before ship and the doc says what Cloudinary actually does
- Secrets: Cloudinary keys stay server side (user-secrets), never logged (`LogRedactor` names `secret`, config logging off)

## 7. Runtime behavior
- **Health:** adds `AddHealthChecks()` + `MapHealthChecks("/health")` (anonymous, no details) with check `media-storage`: `Healthy` when configured, `Degraded` ("storage not configured") when `UnavailableMediaStorage` is active (HTTP 200: the app still serves everything except media). No outbound call on every probe. Startup logs one warning when degraded. Tests pin both states
- **FE on 503:** no preflight; the queue shows "upload unavailable" and keeps text posting working
- **`VideoPlayer` coordination (one app-wide coordinator):** each player reports its visible ratio; the player with the highest ratio >= 0.6 (tie: topmost) plays, all others pause; pause on `visibilitychange` hidden, on lightbox open, on unmount/route change; a user pause sticks until the video leaves & re-enters view; `prefers-reduced-motion` -> no autoplay (play button); `playsInline`, `loop`, `preload="metadata"`; `play()` rejection is swallowed and the element falls back to muted WITHOUT changing the stored preference
- **Mute preference:** `ui-store` `videoMuted` default `true`, session-scoped (not persisted); toggle `aria-pressed`; every player reads it, so videos scrolled into view next follow it
- **Compression fallback (client):** image -> `createImageBitmap(file, { imageOrientation: "from-image" })` (orientation honored) -> canvas `toBlob("image/webp", 0.82)`, longest side <= 2048. Fall back to the ORIGINAL file when: type is GIF or animated, source <= 300 KB, WebP encoding unsupported (blob type not `image/webp`), result not smaller than the original, decode throws, or it takes longer than 10 s. HEIC/unknown types are rejected before upload with a message. Videos are never re-encoded on the client
- **Loader (`lib/media/media-loader.ts`):** `isCloudinaryUrl` uses the same strict parse as `OwnsUrl` (https, host exactly `res.cloudinary.com`, `/{cloud}/{image|video}/upload/` shape; when `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set the cloud must match). Only those URLs are optimized: transformations are inserted right after `/upload/` (before an optional `v123/` version), only when no transformation segment exists; `f_auto,q_auto,c_limit,w_{width}`; video poster variant `.jpg`+`so_0`. Everything else (blob:, data:, other Cloudinary clouds, giphy, legacy hosts) renders with `unoptimized` and goes straight to the browser: NO `remotePatterns` wildcard (would turn `/_next/image` into an open proxy)

## 8. FE (components)
- `MediaImage`, `UserAvatar` (initials underneath, `next/image` on top, hides on error); `AvatarImage` call sites migrate, `components/ui/avatar.tsx` untouched
- `PostMediaGrid` keeps 1/2/3/4+ layouts, boxes from `width/height` (ratio clamped 4:5..16:9, no CLS), `sizes` set, `hover:scale-*` removed; lightbox handles video with controls
- `useMediaUploadQueue` (own file, tested): items `{localId, file, previewUrl, status: compressing|uploading|ready|error, media?}`; sequential `fetch` + FormData (no manual `Content-Type`, same `apiClient` auth & single-flight refresh path, no XHR); `remove` discards on the BE when ready; `discardAll`; `mediaIds` for submit; submit blocked while uploading; error items retry/remove; client mirrors the limits of 2.1 (including aggregate) so it rarely hits 400/413. Plugged into `PostCreatorCore` through a thin adapter, NO refactor of the 1300-line component
- Capabilities: `multiImage` always on; new `mediaUpload` on when `content` is real. Mock mode keeps blob previews. Reply composer hides the media button in real mode (BE comments carry no media)
- Edit profile: avatar picker (upload on select, preview via `UserAvatar`, remove button) sending the payloads of 2.4; close without save discards the pending upload
- Mapper/types: `PostItem.media?: PostMediaItem[]`, `toPostItem` maps `media` (fallback `imageUrl`); `CreatePostInput.mediaIds?`; real `createPost` sends `mediaIds` and external `imageUrl` (GIF) only

## 9. Tests
- Domain: `MediaAsset` status machine (every legal/illegal transition), `Post` media/limit/empty-content, `PostMedia` snapshot
- Application (SQLite + `FakeMediaStorage` with fault injection): write-ahead flow (crash after tx 1, after upload, after tx 2 via injected faults: sweep ends clean), compensation, all-or-nothing, quota token race (parallel reserves never exceed 30), attach race (parallel post creates: exactly one wins), sweep claim race (attach vs claim, claim vs claim), Cloudinary delete failure keeps `Deleting` & retries, already-missing = success, `LogRedactor` never opens the stream
- API integration (fake storage): limit table row by row (incl. aggregate 100 MiB, body cap 413, count, pixel dims), renamed `.exe` as `.png`, SVG/HEIC rejected, foreign/attached/unknown -> 404 everywhere, 429 gates, 503 mapping, avatar payload matrix (2.4) incl. both fields -> 400, spoofed `OwnsUrl` urls rejected on avatar & `imageUrl`, create post with `mediaIds` (order, once only, media-only, edit to empty), `DELETE` rules, health `Healthy`/`Degraded`, swagger pins
- `OwnsUrl` table (section 4.1) in Application tests; loader table in FE tests
- PostgreSQL opt-in: migrations from empty, `MediaAsset` token conflicts on Npgsql, sweep queries. NOT claimed green unless run
- FE: loader, `MediaImage`, grid layouts, `VideoPlayer` (fake IntersectionObserver, coordinator arbitration, play rejection, reduced motion), mute store, compression fallbacks, upload queue (retry, discard, aggregate limit, race), edit-profile payloads, adapters, capability matrix; tests asserting `img src` updated
- **Real smoke (keys in user-secrets):** upload 2 images + 1 video, create post, delivery in browser, remove one, avatar replace, run the sweep, prove deletion through the Cloudinary Admin API, EXIF/GPS check of stored vs delivered bytes; leftovers & results reported honestly

## 10. Decisions & risks
- **Server-proxy upload with buffered `IFormFile`** (not signed direct, not streaming): one place for validation/ownership/`IMediaStorage` swap; costs temp disk & API bandwidth. Upgrade paths: streaming reader, signed direct upload
- **Write-ahead rows** cost 2 commits per upload but make "no orphan file" true by construction
- **Owned `PostMedia` (auto-included)** vs child entity: media is needed by every post projection, hashtags are not
- **Cloudinary limits** (10 MB image / 100 MB video on the free plan) match ours; provider rejections are mapped to 400 and re-checked in the smoke
- **Real Cloudinary calls only in the manual smoke;** tests use the fake
- **Mock mode** keeps blob previews, no media endpoints needed
