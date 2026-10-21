---
module: Media (upload, storage, playback, avatar) - as-built
updated: 2026-10-21
spec: docs/specs/2026-10-21-media-design.md
plan: docs/plans/2026-10-21-media.md
---

# MEDIA

- Contract (endpoints, DTOs, limits, D33 & D34): MAP §2.10, §2.2-2.3, §3 | BE pipeline, deployment & debts: `backend-guide.md` §8.1 & §10 #33-37 | domain: `domain-model.md` §5.7
- **Scope:** users attach several images & videos to a post and upload an avatar; files live in Cloudinary behind `IMediaStorage`; Next `Image` renders everything; abandoned uploads never pile up in Cloudinary. Mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`) keeps blob previews, no media endpoints needed

## 1. Flow

| UI | FE | Real endpoint |
|---|---|---|
| composer attach (`PostCreatorCore`) | `useMediaUploadQueue({ purpose: "post" })` -> `uploadMedia` (one file per request) | `POST /api/media` |
| composer remove / discard / close | `queue.remove` / `discardAll` -> `discardMedia` (best effort, `keepalive` on `pagehide`) | `DELETE /api/media/{id}` |
| submit | `createPost({ content, images, mediaIds })` | `POST /api/posts` (`mediaIds`) |
| edit profile avatar | queue `purpose: "avatar"` -> `updateProfile({ avatarMediaId })` | `POST /api/media` then `PUT /api/users/profiles/me` |
| feed, detail, profile media tab | `mediaItemsOf(post)` -> `PostMediaGrid` / `PostLightbox` / `VideoPlayer` | `PostDto.media[]` |

- Capabilities (`lib/capabilities.ts`): `multiImage` always on (grid renders `media[]` / `imageUrls` in every mode); `mediaUpload` on only when `content` is real
- Replies: media button & GIF picker hidden in real mode (BE comments carry no media); mock mode unchanged

## 2. FE building blocks

| Piece | Where | Rule |
|---|---|---|
| Strict loader | `lib/media/media-loader.ts` | `isCloudinaryUrl` = same parse as BE `OwnsUrl`; `cloudinaryLoader` inserts `f_auto,q_auto,c_limit,w_{n}` right after `/upload/` only when no transformation segment exists; everything else `unoptimized`, NO `remotePatterns` wildcard (open image proxy) |
| `MediaImage` / `UserAvatar` | `components/shared/` | `UserAvatar` = initial under Next `Image`, hides on error, retries when `src` changes; replaced every `AvatarImage` call site; `components/ui/avatar.tsx` untouched |
| `VideoPlayer` + coordinator | `components/shared/video-player.tsx`, `lib/media/video-coordinator.ts` | one app-wide arbiter: highest visible ratio >= 0.6 plays (tie: topmost), others pause; pause on tab hidden & lightbox open; user pause sticks until the video leaves & re-enters view; reduced motion = play button only; `play()` rejection falls back to muted WITHOUT changing the stored preference |
| Mute preference | `ui-store` `videoMuted` | default `true`, session scoped (never persisted), applies to the next videos scrolled into view |
| Aspect boxes | `lib/media/aspect.ts` | width/height clamped to 4:5..16:9, snapped to static Tailwind classes (no inline style), no CLS, no hover scale |
| Compression | `lib/media/compress-image.ts` | `createImageBitmap(file, { imageOrientation: "from-image" })` -> webp 0.82, longest side <= 2048; ORIGINAL kept for GIF, <= 300 KB, no webp encoder, not smaller, decode error, > 10 s; videos never re-encoded |
| Limits mirror | `lib/media/media-limits.ts` | 10 files, image 10 MiB (after compression), video 100 MiB, aggregate 100 MiB, types jpeg/png/gif/webp/mp4/mov/webm |
| Queue hook | `hooks/use-media-upload-queue.ts` | items `compressing -> uploading -> ready | error`; sequential (BE allows 1 in-flight upload per user); `mediaIds`, `isBusy`, `hasError`, `unavailable`; `retry`, `remove`, `discardAll`, `clear` (after a successful post: NO discard) |
| `apiClient.postForm` | `lib/api-client.ts` | FormData sent untouched (no manual `Content-Type`), same Bearer & single-flight refresh path |

## 3. Design decisions
- **Server-proxy upload** (not signed direct, not streaming): one place for validation, ownership and the `IMediaStorage` swap; costs temp disk & API bandwidth (BG §8.1, debt #33)
- **Write-ahead rows:** the DB row precedes the remote file, so "no orphan file" holds by construction; rows `Uploading -> Pending -> Attached -> Released`, deletion through `Deleting`, claimed under the `Version` token
- **GIF vs uploads:** the BE takes uploaded media OR one external image: the GIF picker is disabled while files are queued and new files are refused (toast) while a GIF is attached
- **Queue resilience:** 429 (BE still holds the user slot, e.g. cleaning an aborted upload) is retried automatically after 5 s, up to 3 times; unmount discards unused ready assets (`keepalive`), `pagehide` with `persisted` (bfcache) keeps them
- **Submit rules:** composer ignores submit while uploads run (toast) or an upload failed (retry or remove first); drafts keep text & audience, NOT uploaded media (the BE would sweep it)
- **Avatar payloads (D34):** new upload = `avatarMediaId` only; keep = stored `avatarUrl`; remove = `avatarUrl: null` (no key would also clear); never both; our storage urls are rejected in `avatarUrl` / `imageUrl`
- **`PostMedia` snapshot** keeps `bytes` too (shared `MediaDto`), immutable after create; legacy `imageUrl` = first uploaded image or the external GIF
- **Data-driven size without inline CSS:** `aspectClassOf` buckets (frontend.md forbids inline style)

## 4. Pitfalls & verification
- `UploadFile.OpenRead` is `[SensitiveData]`: a log line never touches the stream (`LogRedactor`); a failed request saves nothing, so the reserve commit is explicit inside the handler (like the OTP attempt counter)
- TestServer ignores `[RequestSizeLimit]`: the 413 is a resource filter on the declared `Content-Length` (+ Kestrel for chunked bodies)
- Swashbuckle names form fields after the CLR property: `[FromForm(Name = "files")]` pins the lowercase contract
- Real smoke (Cloudinary keys in user-secrets, throw-away SQLite DB, remote prefix `ysocial/smoke/`, opt-in test `RealCloudinarySmokeTests`, env `YSOCIAL_SMOKE_CLOUDINARY_DIR`): upload 2 images + 1 video (video 176x144, poster derived), stored asset AND delivered variant carry NO EXIF/GPS (source sample had an Exif APP1 segment), delivery 200 for image, variant, video, poster, post with 3 media, discard 204 with the file gone (Admin API), avatar replace (old `Released`), sweep deleted the released avatar + an abandoned upload, all 7 remote keys removed (0 left). Run twice, same result
- NOT verified: PostgreSQL provider tests for media (`PostgresMediaTests`, no local server), browser visual check of the new UI (grid, lightbox, composer previews, avatar picker: covered by component tests only), video upload above 20 MiB (chunked `UploadLarge` path), real 413 on Kestrel

## 5. Review follow-up (independent review, 2026-10-21)
- Fixed: deny guard fails closed (`Targets`), quota token read before the count, upload phase budget + compensation deletes even when the claim is lost, gate before body binding, 429 auto-retry, unmount/bfcache handling, GIF vs files
- Deferred minors (impact low, see list in the session report): `User.MediaQuotaVersion` token can make an overlapping follow/profile save answer 409 (ms window), concurrent avatar sets can leave an Attached asset nobody references, provider error text is shown to the client, sniffer accepts any `ftyp` brand and rejects `ftyp`-less QuickTime, animated WebP/APNG flattened by compression, FE aggregate check is per post (BE per request), lightbox video ignores the mute preference, hard-coded English alt texts, sweep loads the whole backlog before `Take`, `prefers-reduced-motion` read at first render (SSR mismatch), domain uses `DateTime.UtcNow` next to `TimeProvider`

## 6. Deferred
- Cover upload, alt text, profile Media tab on real BE, signed direct-to-Cloudinary upload, end-to-end streaming upload, blurhash/LQIP, video transcoding profile, virus scanning, purge of media of long-deleted posts/accounts, comment media, drag reorder, upload progress bar (spinner only: `fetch` has no progress) | register: BG §10 #33-37
