export const apiURL = (path: string) => path.startsWith("/") ? path : `/${path}`;
function requestLanguage() {
  if (typeof window === "undefined") return "zh";
  const language = localStorage.getItem("language") || navigator.language.slice(0, 2).toLowerCase();
  return language === "zh" || language === "en" || language === "ja" ? language : "zh";
}
async function request<T>(method: string, path: string, body?: unknown): Promise<{ data: T }> {
  const response = await fetch(apiURL(path), {
    method,
    credentials: "same-origin",
    headers: {
      "accept-language": requestLanguage(),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => undefined) as T & { error?: string };
  if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
  return { data };
}
export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", `/api${apiURL(path)}`),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", `/api${apiURL(path)}`, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>("PUT", `/api${apiURL(path)}`, body),
  delete: <T = unknown>(path: string) => request<T>("DELETE", `/api${apiURL(path)}`),
};
