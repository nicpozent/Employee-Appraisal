export interface AppConfig {
  port: number;
  webOrigin: string;
  authMode: 'entra' | 'mock';
  entra: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    apiAudience: string;
  };
  graph: {
    senderUpn: string;
    importGroupIds: string[];
  };
  reminders: {
    enabled: boolean;
    cron: string;
    leadDays: number;
  };
}

export function loadConfig(): AppConfig {
  const tenantId = process.env.ENTRA_TENANT_ID ?? '';
  const clientId = process.env.ENTRA_CLIENT_ID ?? '';
  const clientSecret = process.env.ENTRA_CLIENT_SECRET ?? '';
  // Auth is "entra" only when explicitly asked AND the minimum config exists.
  const wantEntra = (process.env.AUTH_MODE ?? 'mock').toLowerCase() === 'entra';
  const authMode: 'entra' | 'mock' = wantEntra && tenantId && clientId ? 'entra' : 'mock';

  return {
    port: parseInt(process.env.API_PORT ?? '4000', 10),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    authMode,
    entra: {
      tenantId,
      clientId,
      clientSecret,
      apiAudience: process.env.ENTRA_API_AUDIENCE || clientId,
    },
    graph: {
      senderUpn: process.env.GRAPH_SENDER_UPN ?? '',
      importGroupIds: (process.env.ENTRA_IMPORT_GROUP_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    reminders: {
      enabled: (process.env.REMINDERS_ENABLED ?? 'true').toLowerCase() !== 'false',
      cron: process.env.REMINDERS_CRON ?? '0 8 * * *',
      leadDays: parseInt(process.env.REMINDER_LEAD_DAYS ?? '3', 10),
    },
  };
}

export const APP_CONFIG = 'APP_CONFIG';
