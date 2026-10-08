/** Absolute profile URL for the current origin. Client-only (reads `window.location`). */
export const buildProfileUrl = (username: string): string => `${window.location.origin}/@${username}`;

/** Copies the profile link; false when the clipboard is unavailable or denied. */
export async function copyProfileLink(username: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildProfileUrl(username));
    return true;
  } catch {
    return false;
  }
}
