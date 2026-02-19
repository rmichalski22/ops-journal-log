const TOKEN_KEY = "session_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

type Options = RequestInit & { params?: Record<string, string> };

async function fetchApi(path: string, options: Options = {}) {
  const { params, ...init } = options;
  let url = path;
  if (params) {
    const sp = new URLSearchParams(params);
    url = `${path}?${sp.toString()}`;
  }
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (!(init.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

export const api = {
  auth: {
    login: async (email: string, password: string) => {
      const res = await fetchApi("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (res.token) setToken(res.token);
      return res;
    },
    logout: async () => {
      const res = await fetchApi("/api/auth/logout", { method: "POST" });
      clearToken();
      return res;
    },
    me: () => fetchApi("/api/auth/me"),
  },
  nodes: {
    list: () => fetchApi("/api/nodes"),
    tree: () => fetchApi("/api/nodes/tree"),
    get: (id: string) => fetchApi(`/api/nodes/${id}`),
    create: (data: { parentId?: string; name: string; type?: string }) =>
      fetchApi("/api/nodes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      fetchApi(`/api/nodes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/nodes/${id}`, { method: "DELETE" }),
  },
  records: {
    get: (id: string) => fetchApi(`/api/records/${id}`),
    create: (data: Record<string, unknown>) =>
      fetchApi("/api/records", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      fetchApi(`/api/records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/records/${id}`, { method: "DELETE" }),
  },
  feeds: {
    list: (params?: Record<string, string>) => fetchApi("/api/feeds", { params }),
  },
  subscriptions: {
    list: () => fetchApi("/api/subscriptions"),
    create: (data: { nodeId: string; includeDescendants?: boolean }) =>
      fetchApi("/api/subscriptions", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/subscriptions/${id}`, { method: "DELETE" }),
  },
  admin: {
    audit: (params?: Record<string, string>) => fetchApi("/api/admin/audit", { params }),
  },
  attachments: {
    upload: (recordId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return fetchApi(`/api/attachments/${recordId}`, { method: "POST", body: fd });
    },
  },
};
