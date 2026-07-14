export const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:4000';
export const AUTH_MODE = ((import.meta.env.VITE_AUTH_MODE as string) || 'mock') as 'mock' | 'entra';
export const ENTRA = {
  tenantId: (import.meta.env.VITE_ENTRA_TENANT_ID as string) || '',
  clientId: (import.meta.env.VITE_ENTRA_CLIENT_ID as string) || '',
  apiScope: (import.meta.env.VITE_ENTRA_API_SCOPE as string) || '',
};
