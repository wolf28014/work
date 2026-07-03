// v6.8 — AI 配额管理
// 免费用户每天有限额，Pro 用户无限
// 配额存 localStorage，每天 0 点重置

const QUOTA_KEY = 'ai-usage-v68';

// 免费用户每日配额
export const FREE_QUOTA = {
  chat: 10,           // AI 聊天对话
  parse: 5,           // AI 解析任务
  split: 3,           // AI 拆解子任务
  summary: 1,         // AI 任务总结
  search: 3,          // AI 语义搜索
  focus: 3,           // AI 专注建议
  note: 5,            // AI 笔记助手（摘要/续写/翻译）
  weeklyReport: 1,    // AI 周报（每周 1 次，按天计）
} as const;

export type AIFeature = keyof typeof FREE_QUOTA;

interface UsageRecord {
  date: string;  // YYYY-MM-DD
  counts: Record<string, number>;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getUsage(): UsageRecord {
  const today = getToday();
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === today) return parsed;
    }
  } catch {}
  return { date: today, counts: {} };
}

function saveUsage(usage: UsageRecord) {
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(usage));
  } catch {}
}

/** 是否还能用此功能 */
export function canUse(feature: AIFeature, isPro: boolean): boolean {
  if (isPro) return true;
  const usage = getUsage();
  const used = usage.counts[feature] || 0;
  return used < FREE_QUOTA[feature];
}

/** 剩余次数（Pro 返回 Infinity） */
export function getRemaining(feature: AIFeature, isPro: boolean): number {
  if (isPro) return Infinity;
  const usage = getUsage();
  const used = usage.counts[feature] || 0;
  return Math.max(0, FREE_QUOTA[feature] - used);
}

/** 记录一次使用（成功后才调用） */
export function recordUsage(feature: AIFeature) {
  const usage = getUsage();
  usage.counts[feature] = (usage.counts[feature] || 0) + 1;
  saveUsage(usage);
}

/** 获取所有功能的剩余次数（用于配额面板） */
export function getAllRemaining(isPro: boolean): Record<AIFeature, number> {
  const usage = getUsage();
  const result = {} as Record<AIFeature, number>;
  for (const feature of Object.keys(FREE_QUOTA) as AIFeature[]) {
    if (isPro) {
      result[feature] = Infinity;
    } else {
      const used = usage.counts[feature] || 0;
      result[feature] = Math.max(0, FREE_QUOTA[feature] - used);
    }
  }
  return result;
}

/** Pro 功能的配额文案 */
export const FEATURE_LABELS: Record<AIFeature, string> = {
  chat: 'AI 对话',
  parse: 'AI 解析',
  split: 'AI 拆解',
  summary: 'AI 总结',
  search: 'AI 搜索',
  focus: 'AI 专注建议',
  note: 'AI 笔记',
  weeklyReport: 'AI 周报',
};
