// ============================================================
// Smart-Tasks v6.0 — Theme System
// 5 themes: 4 light + 1 dark. Each theme completely changes
// the global UI colors via CSS variables on :root.
// ============================================================

export type ThemeId = 'ocean-blue' | 'sunset-orange' | 'forest-green' | 'royal-purple' | 'dark-pro';

export interface Theme {
  id: ThemeId;
  name: string;       // Chinese display name
  nameEn: string;     // English name
  emoji: string;
  isDark: boolean;
  primary: string;
  primaryStrong: string;
  bg: string;
  card: string;
  accent: string;
  statusBarBg: string;
  statusBarStyle: 'dark' | 'light';  // dark text on light bg, or light text on dark bg
}

// 5 themes per spec
export const THEMES: Theme[] = [
  {
    id: 'ocean-blue',
    name: '海洋蓝',
    nameEn: 'Ocean Blue',
    emoji: '🌊',
    isDark: false,
    primary: '#3B82F6',
    primaryStrong: '#1d4ed8',
    bg: '#f0f7ff',
    card: '#ffffff',
    accent: '#1d4ed8',
    statusBarBg: '#f0f7ff',
    statusBarStyle: 'dark',
  },
  {
    id: 'sunset-orange',
    name: '夕阳橙',
    nameEn: 'Sunset Orange',
    emoji: '🌅',
    isDark: false,
    primary: '#F97316',
    primaryStrong: '#ea580c',
    bg: '#fff8f3',
    card: '#ffffff',
    accent: '#ea580c',
    statusBarBg: '#fff8f3',
    statusBarStyle: 'dark',
  },
  {
    id: 'forest-green',
    name: '森林绿',
    nameEn: 'Forest Green',
    emoji: '🌲',
    isDark: false,
    primary: '#10B981',
    primaryStrong: '#059669',
    bg: '#f0fdf4',
    card: '#ffffff',
    accent: '#059669',
    statusBarBg: '#f0fdf4',
    statusBarStyle: 'dark',
  },
  {
    id: 'royal-purple',
    name: '皇室紫',
    nameEn: 'Royal Purple',
    emoji: '👑',
    isDark: false,
    primary: '#8B5CF6',
    primaryStrong: '#7c3aed',
    bg: '#faf8ff',
    card: '#ffffff',
    accent: '#7c3aed',
    statusBarBg: '#faf8ff',
    statusBarStyle: 'dark',
  },
  {
    id: 'dark-pro',
    name: '暗夜专业版',
    nameEn: 'Dark Pro',
    emoji: '🌙',
    isDark: true,
    primary: '#818CF8',
    primaryStrong: '#6366F1',
    bg: '#0f0f1a',
    card: '#1e1e30',
    accent: '#6366F1',
    statusBarBg: '#0f0f1a',
    statusBarStyle: 'light',
  },
];

const DEFAULT_THEME_ID: ThemeId = 'ocean-blue';
const STORAGE_KEY = 'app-theme';
const LAST_LIGHT_KEY = 'last-light-theme';

/** Convert hex (#RRGGBB) to rgba string with given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getThemeById(id: string): Theme {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

export function getCurrentThemeId(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.some(t => t.id === stored)) return stored as ThemeId;
  return DEFAULT_THEME_ID;
}

/**
 * Apply a theme by setting CSS variables on document.documentElement
 * and toggling the `dark` class on body.
 *
 * For light themes (1-4): override --primary, --bg, --card, etc.
 * For Dark Pro: rely on the existing body.dark rules (which already
 * match the spec values), just toggle the class.
 */
export function applyTheme(themeId: string): Theme {
  const theme = getThemeById(themeId);
  const root = document.documentElement;

  if (theme.isDark) {
    // Dark Pro theme — clear any inline overrides from previous light theme,
    // then add `dark` class so existing body.dark CSS rules apply.
    // The body.dark rules already set:
    //   --bg: #0f0f1a; --card: #1e1e30; --primary: #818CF8; --primary-strong: #6366F1
    // which match the Dark Pro spec.
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-strong');
    root.style.removeProperty('--primary-soft');
    root.style.removeProperty('--primary-glow');
    root.style.removeProperty('--primary-border');
    root.style.removeProperty('--bg');
    root.style.removeProperty('--card');
    root.style.removeProperty('--shadow-fab');
    document.body.classList.add('dark');
  } else {
    // Light theme — remove `dark` class, then override CSS vars.
    document.body.classList.remove('dark');
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--primary-strong', theme.primaryStrong);
    root.style.setProperty('--primary-soft', hexToRgba(theme.primary, 0.10));
    root.style.setProperty('--primary-glow', hexToRgba(theme.primary, 0.25));
    root.style.setProperty('--primary-border', hexToRgba(theme.primary, 0.28));
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--card', theme.card);
    // Shadow-fab uses primary glow color
    root.style.setProperty('--shadow-fab',
      `0 6px 18px ${hexToRgba(theme.primary, 0.35)}, 0 2px 6px rgba(0, 0, 0, 0.08)`);
  }

  localStorage.setItem(STORAGE_KEY, theme.id);

  // Track last light theme (so toggleTheme can switch back to it)
  if (!theme.isDark) {
    localStorage.setItem(LAST_LIGHT_KEY, theme.id);
  }

  return theme;
}

/** Get the last-used light theme (for the dark mode toggle) */
export function getLastLightThemeId(): ThemeId {
  const stored = localStorage.getItem(LAST_LIGHT_KEY);
  if (stored && THEMES.some(t => t.id === stored && !t.isDark)) return stored as ThemeId;
  return DEFAULT_THEME_ID;
}
