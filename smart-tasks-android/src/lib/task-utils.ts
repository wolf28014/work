import type { Task } from './db';

export const PRIORITY_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' };
export const PRIORITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  low: { bg: 'bg-slate-100 dark:bg-slate-700/40', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  high: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
};
export const STATUS_LABELS: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '已完成', cancelled: '已取消' };
export const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  todo: { bg: 'bg-slate-100 dark:bg-slate-700/50', text: 'text-slate-600 dark:text-slate-300', bar: 'bg-slate-400' },
  in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', bar: 'bg-blue-500' },
  done: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  cancelled: { bg: 'bg-zinc-100 dark:bg-zinc-800/60', text: 'text-zinc-500 dark:text-zinc-400', bar: 'bg-zinc-400' },
};
export const STATUS_ORDER: (keyof typeof STATUS_LABELS)[] = ['todo', 'in_progress', 'done', 'cancelled'];
export const TAG_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
};
export const TAG_COLOR_NAMES = Object.keys(TAG_COLORS);

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.floor((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff <= 7) return `${diff} 天后`;
  if (diff < -1 && diff >= -7) return `${-diff} 天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false;
  return task.dueDate < todayStr();
}

const STOP_WORDS = new Set(['的', '了', '是', '在', '和', '与', '或', '也', '都', '就', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'not']);

export function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const enMatches = lower.match(/[a-z0-9]+/g) || [];
  enMatches.forEach(w => { if (w.length > 1 && !STOP_WORDS.has(w)) tokens.push(w); });
  const cnChars = lower.match(/[\u4e00-\u9fa5]/g) || [];
  for (let i = 0; i < cnChars.length; i++) {
    if (!STOP_WORDS.has(cnChars[i])) tokens.push(cnChars[i]);
    if (i < cnChars.length - 1) {
      const bi = cnChars[i] + cnChars[i + 1];
      if (!STOP_WORDS.has(bi)) tokens.push(bi);
    }
  }
  return tokens;
}

export interface SearchResult { task: Task; score: number; matchedFields: string[]; }

export function tfidfSearch(tasks: Task[], query: string): SearchResult[] {
  if (!query.trim()) return tasks.map(t => ({ task: t, score: 0, matchedFields: [] }));
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return tasks.map(t => ({ task: t, score: 0, matchedFields: [] }));
  const df = new Map<string, number>();
  const taskTokens = new Map<string, string[]>();
  tasks.forEach(t => {
    const text = `${t.title} ${t.description} ${t.tags.join(' ')}`;
    const tokens = tokenize(text);
    taskTokens.set(t.id, tokens);
    const unique = new Set(tokens);
    unique.forEach(tok => df.set(tok, (df.get(tok) || 0) + 1));
  });
  const N = tasks.length;
  const results: SearchResult[] = [];
  tasks.forEach(t => {
    const tokens = taskTokens.get(t.id) || [];
    const tf = new Map<string, number>();
    tokens.forEach(tok => tf.set(tok, (tf.get(tok) || 0) + 1));
    let score = 0;
    const matched: string[] = [];
    qTokens.forEach(qt => {
      if (df.has(qt)) {
        const idf = Math.log((N + 1) / (df.get(qt)! + 1)) + 1;
        const tfVal = tf.get(qt) || 0;
        if (tfVal > 0) {
          score += tfVal * idf;
          if (t.title.toLowerCase().includes(qt)) matched.push('标题');
          else if (t.description.toLowerCase().includes(qt)) matched.push('描述');
          else if (t.tags.some(tg => tg.toLowerCase().includes(qt))) matched.push('标签');
        }
      }
    });
    if (score > 0) results.push({ task: t, score, matchedFields: matched });
  });
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function tasksToCSV(tasks: Task[]): string {
  const headers = ['ID', '标题', '描述', '截止日期', '优先级', '状态', '重复', '标签', '子任务完成数', '番茄钟数', '创建时间', '完成时间'];
  const rows = tasks.map(t => [
    t.id,
    `"${t.title.replace(/"/g, '""')}"`,
    `"${t.description.replace(/"/g, '""')}"`,
    t.dueDate || '',
    PRIORITY_LABELS[t.priority],
    STATUS_LABELS[t.status],
    t.recurrence || '',
    t.tags.join(';'),
    `${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}`,
    String(t.pomodoros),
    new Date(t.createdAt).toLocaleString('zh-CN'),
    t.completedAt ? new Date(t.completedAt).toLocaleString('zh-CN') : '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function generateNextRecurrence(task: Task): Partial<Task> | null {
  if (!task.recurrence || !task.dueDate) return null;
  const d = new Date(task.dueDate);
  if (task.recurrence === 'daily') d.setDate(d.getDate() + 1);
  else if (task.recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (task.recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  return { dueDate: d.toISOString().slice(0, 10) };
}
