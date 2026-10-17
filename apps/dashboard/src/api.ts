/**
 * API client for the Team MCP Gateway.
 * The API key is stored in localStorage and sent as a Bearer token on every request.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';

function getKey(): string {
  return localStorage.getItem('apiKey') ?? '';
}

export function setApiKey(key: string) {
  localStorage.setItem('apiKey', key);
}

export function clearApiKey() {
  localStorage.removeItem('apiKey');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getKey()}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Auth / me
// ---------------------------------------------------------------------------
export const api = {
  me: () => request<any>('GET', '/admin/me'),

  // ---------------------------------------------------------------------------
  // Upstreams
  // ---------------------------------------------------------------------------
  upstreams: {
    list: () => request<any>('GET', '/admin/upstreams'),
    create: (data: { name: string; url: string; description?: string; credential?: string }) =>
      request<any>('POST', '/admin/upstreams', data),
    update: (id: string, data: Partial<{ name: string; url: string; description: string; credential: string; enabled: boolean }>) =>
      request<any>('PATCH', `/admin/upstreams/${id}`, data),
    toggle: (id: string, enabled: boolean) =>
      request<any>('PATCH', `/admin/upstreams/${id}/toggle`, { enabled }),
    delete: (id: string) => request<any>('DELETE', `/admin/upstreams/${id}`),
  },

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------
  users: {
    list: () => request<any>('GET', '/admin/users'),
    create: (data: { email: string; name?: string }) =>
      request<any>('POST', '/admin/users', data),
    rotateKey: (userId: string) =>
      request<any>('POST', `/admin/users/${userId}/rotate-key`),
    revokeKeys: (userId: string) =>
      request<any>('POST', `/admin/users/${userId}/revoke-keys`),
    generateMyKey: () =>
      request<any>('POST', '/admin/users/me/generate-key'),
  },

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------
  audit: {
    list: (page = 1, limit = 50) =>
      request<any>('GET', `/admin/audit?page=${page}&limit=${limit}`),
  },

  // ---------------------------------------------------------------------------
  // Chat agent
  // ---------------------------------------------------------------------------
  chat: {
    send: (messages: Array<{ role: string; content: string }>) =>
      request<any>('POST', '/chat', { messages }),
  },
};
