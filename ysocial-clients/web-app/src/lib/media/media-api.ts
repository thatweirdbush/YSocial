import { apiClient } from "@/lib/api-client";
import type { components } from "@/lib/api/generated";

/** Swagger marks every field optional; the upload response always carries an id and a url (checked below). */
export type UploadedMedia = components["schemas"]["MediaDto"] & { id: string; url: string };

export type MediaPurposeName = "post" | "avatar";

/** Uploads ONE file as a Pending asset (`POST /api/media`); the queue sends files one by one (the BE allows 1 in-flight upload per user). */
export async function uploadMedia(file: File, purpose: MediaPurposeName, signal?: AbortSignal): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("files", file, file.name);

  const items = await apiClient.postForm<UploadedMedia[]>("/api/media", form, { signal });
  const [media] = items ?? [];
  if (!media?.id || !media.url) throw new Error("Malformed upload response");

  return media as UploadedMedia;
}

/** Best-effort cleanup of a Pending asset (remove, composer discard); `keepalive` lets it survive a page unload. */
export async function discardMedia(id: string, options: { keepalive?: boolean } = {}): Promise<void> {
  try {
    await apiClient.delete(`/api/media/${id}`, options.keepalive ? { keepalive: true } : undefined);
  } catch {
    // Already gone, attached elsewhere or the network is down: the BE sweep removes abandoned uploads anyway
  }
}
