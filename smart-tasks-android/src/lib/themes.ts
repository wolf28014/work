// ============================================================
// Smart-Tasks v6.1 — Theme System
// 10 themes: 4 solid light + 1 solid dark + 5 gradient themes (cherry/warm-sand light,
// aurora/midnight/deep-ocean dark).
// Each theme completely changes the global UI colors via CSS variables on :root.
// ============================================================

export type ThemeId =
  | 'ocean-blue'
  | 'sunset-orange'
  | 'forest-green'
  | 'royal-purple'
  | 'dark-pro'
  // v6.1 — 5 gradient themes (3 dark + 2 light)
  | 'aurora'      // dark — purple→deep purple gradient
  | 'cherry'      // light — coral→pink gradient
  | 'midnight'    // dark — 3-stop very dark gradient
  | 'warm-sand'   // light — golden→peach gradient
  | 'deep-ocean'; // dark — blue→cyan gradient

export interface Theme {
  id: ThemeId;
  name: string;          // Chinese display name
  nameEn: string;        // English name
  emoji: string;
  isDark: boolean;

  // Primary palette
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryGlow: string;
  primaryBorder: string;

  // Surfaces (bg can be a CSS gradient; card can be rgba for translucency)
  bg: string;
  bgElevated: string;
  card: string;
  cardHover: string;
  cardActive: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;

  // Borders
  border: string;
  borderStrong: string;

  // Bars / overlay
  barBg: string;
  modalMask: string;

  // Misc
  accent: string;        // legacy field (rarely used)
  statusBarBg: string;   // hex color for native status bar
  statusBarStyle: 'dark' | 'light';  // dark text on light bg, or light text on dark bg
}

// Shared light-theme surface defaults (used by 4 solid-light + 4 gradient-light themes)
const LIGHT_TEXT = {
  textPrimary: '#1d1d1f',
  textSecondary: 'rgba(0, 0, 0, 0.55)',
  textTertiary: 'rgba(0, 0, 0, 0.35)',
  textQuaternary: 'rgba(0, 0, 0, 0.20)',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.14)',
  modalMask: 'rgba(0, 0, 0, 0.3)',
};
const DARK_TEXT = {
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.75)',
  textTertiary: 'rgba(255, 255, 255, 0.50)',
  textQuaternary: 'rgba(255, 255, 255, 0.30)',
  border: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.20)',
  modalMask: 'rgba(0, 0, 0, 0.6)',
};

/** Build the 3 primary tint variants (soft/glow/border) from a hex color. */
function tints(hex: string, softA = 0.10, glowA = 0.25, borderA = 0.28) {
  return {
    primarySoft: hexToRgba(hex, softA),
    primaryGlow: hexToRgba(hex, glowA),
    primaryBorder: hexToRgba(hex, borderA),
  };
}

export const THEMES: Theme[] = [
  // === 5 original themes (kept as-is, with new fields filled in) ===
  {
    id: 'ocean-blue',
    name: '海洋蓝',
    nameEn: 'Ocean Blue',
    emoji: '🌊',
    isDark: false,
    primary: '#3B82F6',
    primaryStrong: '#1d4ed8',
    ...tints('#3B82F6'),
    bg: '#f0f7ff',
    bgElevated: 'rgba(0, 0, 0, 0.02)',
    card: '#ffffff',
    cardHover: '#fafafa',
    cardActive: '#f0f0f2',
    ...LIGHT_TEXT,
    barBg: 'rgba(255, 255, 255, 0.82)',
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
    ...tints('#F97316'),
    bg: '#fff8f3',
    bgElevated: 'rgba(0, 0, 0, 0.02)',
    card: '#ffffff',
    cardHover: '#fafafa',
    cardActive: '#f0f0f2',
    ...LIGHT_TEXT,
    barBg: 'rgba(255, 255, 255, 0.82)',
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
    ...tints('#10B981'),
    bg: '#f0fdf4',
    bgElevated: 'rgba(0, 0, 0, 0.02)',
    card: '#ffffff',
    cardHover: '#fafafa',
    cardActive: '#f0f0f2',
    ...LIGHT_TEXT,
    barBg: 'rgba(255, 255, 255, 0.82)',
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
    ...tints('#8B5CF6'),
    bg: '#faf8ff',
    bgElevated: 'rgba(0, 0, 0, 0.02)',
    card: '#ffffff',
    cardHover: '#fafafa',
    cardActive: '#f0f0f2',
    ...LIGHT_TEXT,
    barBg: 'rgba(255, 255, 255, 0.82)',
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
    primarySoft: 'rgba(129, 140, 248, 0.20)',
    primaryGlow: 'rgba(129, 140, 248, 0.40)',
    primaryBorder: 'rgba(129, 140, 248, 0.35)',
    bg: '#0f0f1a',
    bgElevated: '#1c1c2e',
    card: '#1e1e30',
    cardHover: '#262640',
    cardActive: '#2e2e4a',
    ...DARK_TEXT,
    barBg: 'rgba(15, 15, 26, 0.90)',
    accent: '#6366F1',
    statusBarBg: '#0f0f1a',
    statusBarStyle: 'light',
  },

  // === v6.1 — 5 gradient themes (3 dark + 2 light) ===
  // Spec gradients applied directly as `bg`. Cards are SOLID (white for light themes,
  // dark for dark themes) so text remains readable on vibrant gradients.
  {
    id: 'aurora',
    name: '极光',
    nameEn: 'Aurora',
    emoji: '🌌',
    isDark: true,
    // 渐变: 紫蓝极光 — linear-gradient(135deg, #667eea, #764ba2)
    primary: '#A78BFA',
    primaryStrong: '#8B5CF6',
    primarySoft: 'rgba(167, 139, 250, 0.20)',
    primaryGlow: 'rgba(167, 139, 250, 0.40)',
    primaryBorder: 'rgba(167, 139, 250, 0.35)',
    bg: 'linear-gradient(135deg, #667eea, #764ba2)',
    bgElevated: '#2a2654',
    card: '#1f1b3a',
    cardHover: '#272149',
    cardActive: '#2f275a',
    ...DARK_TEXT,
    barBg: 'rgba(31, 27, 58, 0.85)',
    accent: '#8B5CF6',
    statusBarBg: '#667eea',
    statusBarStyle: 'light',
  },
  {
    id: 'cherry',
    name: '樱花',
    nameEn: 'Cherry Blossom',
    emoji: '🌸',
    isDark: false,
    // 渐变: 樱花粉 — linear-gradient(135deg, #FF9A9E, #FECFEF)
    primary: '#EC4899',
    primaryStrong: '#DB2777',
    ...tints('#EC4899'),
    bg: 'linear-gradient(135deg, #FF9A9E, #FECFEF)',
    bgElevated: '#ffffff',
    card: '#ffffff',
    cardHover: '#fafafa',
    cardActive: '#f5f5f7',
    ...LIGHT_TEXT,
    barBg: 'rgba(255, 255, 255, 0.85)',
    accent: '#DB2777',
    statusBarBg: '#FF9A9E',
    statusBarStyle: 'dark',
  },
  {
    id: 'midnight',
    name: '午夜',
    nameEn: 'Midnight Sky',
    emoji: '✨',
    isDark: true,
    // 渐变: 深蓝紫夜空 — linear-gradient(135deg, #0f0c29, #302b63, #24243e)
    primary: '#818CF8',
    primaryStrong: '#6366F1',
    primarySoft: 'rgba(129, 140, 248, 0.20)',
    primaryGlow: 'rgba(129, 140, 248, 0.40)',
    primaryBorder: 'rgba(129, 140, 248, 0.35)',
    bg: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    bgElevated: '#1a1830',
    card: '#1c1a36',
    cardHover: '#23203f',
    cardActive: '#2a274a',
    ...DARK_TEXT,
    barBg: 'rgba(15, 12, 41, 0.85)',
    accent: '#6366F1',
    statusBarBg: '#0f0c29',
    statusBarStyle: 'light',
  },
  {
    id: 'warm-sand',
    name: '暖沙',
    nameEn: 'Warm Sand',
    emoji: '🏜️',
    isDark: false,
    // 渐变: 暖沙 — linear-gradient(135deg, #f6d365, #fda085)
    primary: '#F59E0B',
    primaryStrong: '#D97706',
    ...tints('#F59E0B'),
    bg: 'linear-gradient(135deg, #f6d365, #fda085)',
    bgElevated: '#ffffff',
    card: '#ffffff',
    cardHover: '#fafafa',
    cardActive: '#f5f5f7',
    ...LIGHT_TEXT,
    barBg: 'rgba(255, 255, 255, 0.85)',
    accent: '#D97706',
    statusBarBg: '#f6d365',
    statusBarStyle: 'dark',
  },
  {
    id: 'deep-ocean',
    name: '深海',
    nameEn: 'Deep Ocean',
    emoji: '🐳',
    isDark: true,
    // 渐变: 深海 — linear-gradient(135deg, #2E3192, #1BFFFF)
    primary: '#22D3EE',
    primaryStrong: '#06B6D4',
    primarySoft: 'rgba(34, 211, 238, 0.20)',
    primaryGlow: 'rgba(34, 211, 238, 0.40)',
    primaryBorder: 'rgba(34, 211, 238, 0.35)',
    bg: 'linear-gradient(135deg, #2E3192, #1BFFFF)',
    bgElevated: '#0d1640',
    card: '#101a4d',
    cardHover: '#15205a',
    cardActive: '#1a2668',
    ...DARK_TEXT,
    barBg: 'rgba(13, 22, 64, 0.85)',
    accent: '#06B6D4',
    statusBarBg: '#2E3192',
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
 * v6.1 — All 10 themes now set ALL CSS variables explicitly. For dark themes
 * (dark-pro, aurora, midnight, deep-ocean), we also add `body.dark` so the
 * existing ambient-glow CSS rules apply (they layer radial gradients over
 * `var(--bg)`).
 *
 * For gradient themes (aurora, cherry, midnight, warm-sand, deep-ocean), the
 * `--bg` CSS variable is the full `linear-gradient(...)` string, which the body
 * background uses directly. Cards are solid (white for light gradient themes,
 * dark for dark gradient themes) so text remains readable on vibrant gradients.
 */
export function applyTheme(themeId: string): Theme {
  const theme = getThemeById(themeId);
  const root = document.documentElement;

  // Always set all CSS variables explicitly
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-strong', theme.primaryStrong);
  root.style.setProperty('--primary-soft', theme.primarySoft);
  root.style.setProperty('--primary-glow', theme.primaryGlow);
  root.style.setProperty('--primary-border', theme.primaryBorder);

  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--bg-elevated', theme.bgElevated);
  root.style.setProperty('--card', theme.card);
  root.style.setProperty('--card-hover', theme.cardHover);
  root.style.setProperty('--card-active', theme.cardActive);

  root.style.setProperty('--text-primary', theme.textPrimary);
  root.style.setProperty('--text-secondary', theme.textSecondary);
  root.style.setProperty('--text-tertiary', theme.textTertiary);
  root.style.setProperty('--text-quaternary', theme.textQuaternary);

  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--border-strong', theme.borderStrong);

  root.style.setProperty('--bar-bg', theme.barBg);
  root.style.setProperty('--modal-mask', theme.modalMask);

  // Shadow-fab uses the primary glow color
  root.style.setProperty('--shadow-fab',
    `0 6px 18px ${theme.primaryGlow}, 0 2px 6px rgba(0, 0, 0, 0.08)`);

  // Toggle body.dark class for the ambient-glow background + dark-themed accents
  if (theme.isDark) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
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

/** Check if a theme id is one of the dark themes (dark-pro or midnight). */
export function isDarkTheme(themeId: string): boolean {
  return getThemeById(themeId).isDark;
}
