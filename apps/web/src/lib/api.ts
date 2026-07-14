import { API_BASE } from './config';

/* Session token holder — set by the auth layer (mock UPN or Entra bearer). */
let authHeader: Record<string, string> = {};
export function setMockUpn(upn: string | null) {
  authHeader = upn ? { 'x-dev-upn': upn } : {};
}
export function setBearer(token: string | null) {
  authHeader = token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.message || msg; } catch { /* ignore */ }
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, body?: any) => request<T>('POST', p, body),
  patch: <T>(p: string, body?: any) => request<T>('PATCH', p, body),
  put: <T>(p: string, body?: any) => request<T>('PUT', p, body),
};
