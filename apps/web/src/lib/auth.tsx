import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { PublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { AUTH_MODE, ENTRA } from './config';
import { api, setMockUpn, setBearer } from './api';
import { Me } from './types';

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  authMode: 'mock' | 'entra';
  signInMock: (upn: string) => Promise<void>;
  signInEntra: () => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  /** Step-up re-authentication for e-signature (§7). Forces a fresh interactive
      login in Entra mode; no-op in dev-mock. Throws if the user cancels/fails. */
  stepUpReauth: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const MOCK_KEY = 'appraisal.mockUpn';

let msal: PublicClientApplication | null = null;
function getMsal() {
  if (!msal) {
    msal = new PublicClientApplication({
      auth: {
        clientId: ENTRA.clientId,
        authority: `https://login.microsoftonline.com/${ENTRA.tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
  }
  return msal;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const m = await api.get<Me>('/me');
      setMe(m);
    } catch {
      setMe(null);
    }
  }, []);

  const acquireEntraToken = useCallback(async (account: AccountInfo) => {
    const inst = getMsal();
    const scopes = ENTRA.apiScope ? [ENTRA.apiScope] : [`${ENTRA.clientId}/.default`];
    const res = await inst.acquireTokenSilent({ account, scopes }).catch(() => inst.acquireTokenPopup({ scopes }));
    setBearer(res.accessToken);
  }, []);

  useEffect(() => {
    (async () => {
      if (AUTH_MODE === 'entra') {
        const inst = getMsal();
        await inst.initialize();
        const accounts = inst.getAllAccounts();
        if (accounts.length) {
          await acquireEntraToken(accounts[0]);
          await loadMe();
        }
      } else {
        const upn = localStorage.getItem(MOCK_KEY);
        if (upn) {
          setMockUpn(upn);
          await loadMe();
        }
      }
      setLoading(false);
    })();
  }, [acquireEntraToken, loadMe]);

  const signInMock = async (upn: string) => {
    localStorage.setItem(MOCK_KEY, upn);
    setMockUpn(upn);
    await loadMe();
  };

  const signInEntra = async () => {
    const inst = getMsal();
    await inst.initialize();
    const res = await inst.loginPopup({ scopes: ['openid', 'profile', 'email'] });
    inst.setActiveAccount(res.account);
    await acquireEntraToken(res.account);
    await loadMe();
  };

  const stepUpReauth = async () => {
    if (AUTH_MODE !== 'entra') return; // dev-mock: nothing to step up
    const inst = getMsal();
    await inst.initialize();
    const account = inst.getActiveAccount() ?? inst.getAllAccounts()[0];
    const scopes = ENTRA.apiScope ? [ENTRA.apiScope] : [`${ENTRA.clientId}/.default`];
    // prompt=login forces a fresh interactive credential prompt (non-repudiable signing).
    await inst.acquireTokenPopup({ scopes, prompt: 'login', account });
  };

  const signOut = () => {
    if (AUTH_MODE === 'entra') {
      const inst = getMsal();
      inst.logoutRedirect().catch(() => {});
      setBearer(null);
    } else {
      localStorage.removeItem(MOCK_KEY);
      setMockUpn(null);
    }
    setMe(null);
  };

  return (
    <Ctx.Provider value={{ me, loading, authMode: AUTH_MODE, signInMock, signInEntra, signOut, refresh: loadMe, stepUpReauth }}>
      {children}
    </Ctx.Provider>
  );
}
