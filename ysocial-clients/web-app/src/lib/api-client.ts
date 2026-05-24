import { useAuthStore } from "@/features/auth/store/auth-store";

const BASE_URL = "https://localhost:49895";

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number>;
}

// Queue system to coordinate request replays during silent refresh token rotations
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string | null) => void;
  reject: (reason: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Deep camelCase DTO mapper utility to fulfill strict naming standards from swagger PascalCase
export function camelCaseKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(camelCaseKeys);
  } else if (obj !== null && typeof obj === "object" && !(obj instanceof Date) && !(obj instanceof File)) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = camelCaseKeys(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return Promise.reject({
      status: response.status,
      ...camelCaseKeys(errorData),
    });
  }
  
  if (response.status === 204) {
    return null;
  }
  
  const text = await response.text();
  if (!text) return null;
  
  try {
    const json = JSON.parse(text);
    return camelCaseKeys(json);
  } catch {
    return text;
  }
}

export async function apiFetch(path: string, options: RequestOptions = {}): Promise<any> {
  // 1. LAZY EVALUATION: Dynamically fetch access token inside the call context
  const accessToken = useAuthStore.getState().accessToken;

  // 2. Build full URL with query parameters
  let url = `${BASE_URL}${path}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, val]) => {
      searchParams.append(key, String(val));
    });
    url += `?${searchParams.toString()}`;
  }

  // 3. Assemble Headers safely
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);

    // 4. Intercept 401 errors for Silent Refresh Token Rotation
    if (response.status === 401 && !path.includes("/api/identities/refresh-token")) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (newToken) => {
              const updatedHeaders = new Headers(config.headers);
              updatedHeaders.set("Authorization", `Bearer ${newToken}`);
              config.headers = updatedHeaders;
              resolve(fetch(url, config).then(handleResponse));
            },
            reject: (err) => reject(err),
          });
        });
      }

      isRefreshing = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (!refreshToken) {
        useAuthStore.getState().actions.clearAuth();
        return Promise.reject({ status: 401, detail: "No refresh token available." });
      }

      return new Promise((resolve, reject) => {
        fetch(`${BASE_URL}/api/identities/refresh-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        })
          .then(async (refreshRes) => {
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              const newAccess = data.accessToken || data.AccessToken;
              const newRefresh = data.refreshToken || data.RefreshToken;

              // Save new tokens
              useAuthStore.getState().actions.setTokens(newAccess, newRefresh);
              processQueue(null, newAccess);

              const updatedHeaders = new Headers(config.headers);
              updatedHeaders.set("Authorization", `Bearer ${newAccess}`);
              config.headers = updatedHeaders;
              resolve(fetch(url, config).then(handleResponse));
            } else {
              throw new Error("Token rotation failed");
            }
          })
          .catch((err) => {
            processQueue(err, null);
            useAuthStore.getState().actions.clearAuth();
            if (typeof window !== "undefined") {
              window.location.href = "/auth/login";
            }
            reject(err);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    return await handleResponse(response);
  } catch (error: any) {
    return Promise.reject(error);
  }
}

export const apiClient = {
  get: (path: string, options?: Omit<RequestOptions, "method">) =>
    apiFetch(path, { ...options, method: "GET" }),
  post: (path: string, body?: any, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch(path, { ...options, method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: any, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch(path, { ...options, method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch(path, { ...options, method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string, options?: Omit<RequestOptions, "method">) =>
    apiFetch(path, { ...options, method: "DELETE" }),
};
