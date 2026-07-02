// 背景设置 - 5 个预设纯色 + 自定义图片
// 数据存 localStorage（小） + IndexedDB（图片 base64，可能较大）

const STORAGE_KEY = 'app-background';
const DB_NAME = 'smart-tasks-bg';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const IMAGE_RECORD_ID = 'custom-bg';

export type BackgroundType = 'preset' | 'custom' | 'none';

export interface BackgroundSettings {
  type: BackgroundType;
  presetId?: string;     // 预设背景 id
  customImageId?: string; // 自定义图片记录 id
  blur?: number;         // 模糊度 0-20
  dim?: number;          // 暗化 0-1（让任务卡片更突出）
}

// 8 个高级纯色背景 - 灵感来自 Apple Vision Pro / Things 3 / Notion
export interface PresetBackground {
  id: string;
  name: string;
  // 用于 CSS 变量
  cssBackground: string;
  // 缩略图颜色（用于选择器小方块）
  thumb: string;
  // 文字色（深色或浅色）
  textMode: 'light' | 'dark';
}

export const PRESET_BACKGROUNDS: PresetBackground[] = [
  {
    id: 'linen',
    name: '亚麻',
    cssBackground: 'linear-gradient(135deg, #f5f5f0 0%, #ede9d8 100%)',
    thumb: 'linear-gradient(135deg, #f5f5f0, #ede9d8)',
    textMode: 'dark',
  },
  {
    id: 'peach',
    name: '蜜桃',
    cssBackground: 'linear-gradient(135deg, #ffe4d6 0%, #ffcab5 100%)',
    thumb: 'linear-gradient(135deg, #ffe4d6, #ffcab5)',
    textMode: 'dark',
  },
  {
    id: 'sage',
    name: '鼠尾草',
    cssBackground: 'linear-gradient(135deg, #d4e4d4 0%, #a8c5a8 100%)',
    thumb: 'linear-gradient(135deg, #d4e4d4, #a8c5a8)',
    textMode: 'dark',
  },
  {
    id: 'mist',
    name: '晨雾',
    cssBackground: 'linear-gradient(135deg, #e0e7eb 0%, #b8c5cc 100%)',
    thumb: 'linear-gradient(135deg, #e0e7eb, #b8c5cc)',
    textMode: 'dark',
  },
  {
    id: 'ocean',
    name: '深海',
    cssBackground: 'linear-gradient(135deg, #134e5e 0%, #1e6091 100%)',
    thumb: 'linear-gradient(135deg, #134e5e, #1e6091)',
    textMode: 'light',
  },
  {
    id: 'sunset',
    name: '日落',
    cssBackground: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
    thumb: 'linear-gradient(135deg, #ff6e7f, #bfe9ff)',
    textMode: 'light',
  },
  {
    id: 'aurora',
    name: '极光',
    cssBackground: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    thumb: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    textMode: 'light',
  },
  {
    id: 'noir',
    name: '墨黑',
    cssBackground: 'linear-gradient(135deg, #232526 0%, #1a1a1a 100%)',
    thumb: 'linear-gradient(135deg, #232526, #1a1a1a)',
    textMode: 'light',
  },
];

// IndexedDB 操作
let dbInstance: IDBDatabase | null = null;

function openBgDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveCustomImage(base64: string): Promise<void> {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).put({ id: IMAGE_RECORD_ID, data: base64, savedAt: Date.now() });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getCustomImage(): Promise<string | null> {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readonly');
    const req = t.objectStore(STORE_NAME).get(IMAGE_RECORD_ID);
    req.onsuccess = () => resolve(req.result?.data || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearCustomImage(): Promise<void> {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).delete(IMAGE_RECORD_ID);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// 设置读写
export function getBackgroundSettings(): BackgroundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { type: 'preset', presetId: 'linen' }; // 默认亚麻
    return JSON.parse(raw);
  } catch {
    return { type: 'preset', presetId: 'linen' };
  }
}

export function saveBackgroundSettings(s: BackgroundSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// 计算最终应用的背景 CSS
export function resolveBackgroundCss(settings: BackgroundSettings, customImage?: string | null): {
  css: string;
  textMode: 'light' | 'dark';
} | null {
  if (settings.type === 'none') return null;
  if (settings.type === 'preset') {
    const preset = PRESET_BACKGROUNDS.find(p => p.id === settings.presetId);
    if (!preset) return null;
    return { css: preset.cssBackground, textMode: preset.textMode };
  }
  if (settings.type === 'custom' && customImage) {
    return { css: `url(${customImage}) center/cover no-repeat fixed`, textMode: 'light' };
  }
  return null;
}
