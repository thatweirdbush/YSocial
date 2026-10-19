const DEVICE_ID_KEY = "ysocial_device_id";

let memoryId: string | null = null;

const createId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const rand = Math.floor(Math.random() * 16);
        return (char === "x" ? rand : (rand & 0x3) | 0x8).toString(16);
      });

/** Stable per-browser id sent as `deviceId` on login (BE session list); falls back to memory when storage fails. */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    memoryId ??= createId();
    localStorage.setItem(DEVICE_ID_KEY, memoryId);
    return memoryId;
  } catch {
    memoryId ??= createId();
    return memoryId;
  }
}
