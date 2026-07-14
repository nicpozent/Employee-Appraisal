import { create } from 'zustand';

export type Theme = 'daylight' | 'command' | 'midnight';
const KEY = 'appraisal.theme';

interface ThemeState { theme: Theme; setTheme: (t: Theme) => void; }

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY, t);
}

const initial = (localStorage.getItem(KEY) as Theme) || 'daylight';
apply(initial);

export const useTheme = create<ThemeState>((set) => ({
  theme: initial,
  setTheme: (t) => { apply(t); set({ theme: t }); },
}));
