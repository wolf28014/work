// AI 客户端 - OpenAI 兼容接口
// v6.7 — 重构：流式输出、超时、重试、API Key 加密、temperature 可配
// v6.8 — Pro 用户用内置 API Key（免配置），免费用户限额 + 自带 Key

import { getCurrentProStatus, getProAIConfig } from './auth';
import { canUse, recordUsage, type AIFeature } from './ai-quota';

export interface AISettings {
  baseURL: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'ai-settings';
// v6.7 — API Key 加密：简单 XOR 混淆（不是真正加密，但能防一眼看到）
// 真正的安全需要后端代理，这里只是 obfuscation
const KEY_OBFUSCATE_SALT = 'smart-tasks-v67';

function obfuscate(key: string): string {
  // 简单 XOR 混淆，让 Key 不以明文存储
  let result = '';
  for (let i = 0; i < key.length; i++) {
    result += String.fromCharCode(key.charCodeAt(i) ^ KEY_OBFUSCATE_SALT.charCodeAt(i % KEY_OBFUSCATE_SALT.length));
  }
  // base64 编码避免特殊字符问题
  return btoa(unescape(encodeURIComponent(result)));
}
function deobfuscate(stored: string): string {
  try {
    const decoded = decodeURIComponent(escape(atob(stored)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ KEY_OBFUSCATE_SALT.charCodeAt(i % KEY_OBFUSCATE_SALT.length));
    }
    return result;
  } catch { return ''; }
}

export function getAISettings(): AISettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // v6.7 — 解混淆 apiKey
    return {
      baseURL: parsed.baseURL || '',
      apiKey: parsed.apiKey ? deobfuscate(parsed.apiKey) : '',
      model: parsed.model || '',
    };
  } catch { return null; }
}

// v6.8 — 判断 AI 是否可用（自带 Key 或 Pro）
// Pro 用户即使没配 Key 也能用（内置 Key）
export function hasAIConfigured(): boolean {
  if (getAISettings()) return true;
  return isProActive();
}

export function saveAISettings(s: AISettings) {
  // v6.7 — 混淆 apiKey 后存储
  const stored = { baseURL: s.baseURL, apiKey: s.apiKey ? obfuscate(s.apiKey) : '', model: s.model };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function clearAISettings() {
  localStorage.removeItem(STORAGE_KEY);
}

// v6.8 — Pro 配置和配额
const FEATURE_LABELS: Record<AIFeature, string> = {
  chat: 'AI 对话', parse: 'AI 解析', split: 'AI 拆解', summary: 'AI 总结',
  search: 'AI 搜索', focus: 'AI 专注建议', note: 'AI 笔记', weeklyReport: 'AI 周报',
};

function isProActive(): boolean {
  const pro = getCurrentProStatus();
  return pro.isPro && (!pro.expiresAt || pro.expiresAt > Date.now());
}

export async function getEffectiveAISettings(): Promise<AISettings | null> {
  if (isProActive()) {
    const proConfig = await getProAIConfig();
    if (proConfig) return proConfig;
  }
  return getAISettings();
}

function checkQuota(feature: AIFeature): void {
  if (!canUse(feature, isProActive())) {
    throw new Error(`今日${FEATURE_LABELS[feature]}次数已用完，升级 Pro 解锁无限`);
  }
}

function recordFeatureUsage(feature: AIFeature): void {
  if (!isProActive()) recordUsage(feature);
}

// v6.7 — 请求超时 + 重试 + AbortController 支持
const DEFAULT_TIMEOUT = 30000;  // 30 秒
const MAX_RETRIES = 2;

interface AIChatOptions {
  temperature?: number;
  timeout?: number;
  signal?: AbortSignal;  // 外部取消信号
  // v6.7 — Function Calling 支持
  tools?: any[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  // v6.8 — 允许外部传入 settings（Pro Key 或自带 Key）
  settings?: AISettings;
}

/**
 * 非流式聊天（保留原 API 兼容）
 * v6.7 — 加超时、重试、取消支持
 */
export async function aiChat(
  messages: { role: string; content: string }[],
  settings?: AISettings,
  options: AIChatOptions = {}
): Promise<string> {
  const s = settings || getAISettings();
  if (!s) throw new Error('未配置 AI API，请先在设置中填入');
  const url = s.baseURL.replace(/\/$/, '') + '/chat/completions';

  const temperature = options.temperature ?? 0.7;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 合并外部 signal 和超时 signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (options.signal) {
      if (options.signal.aborted) { clearTimeout(timeoutId); controller.abort(); }
      else options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const body: any = { model: s.model, messages, temperature, stream: false };
      if (options.tools) body.tools = options.tools;
      if (options.toolChoice) body.tool_choice = options.toolChoice;

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errText = await resp.text();
        // 429 / 5xx 才重试
        if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
          lastError = new Error(`AI 请求失败 (${resp.status})`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));  // 指数退避
          continue;
        }
        // 其他错误不重试，给用户友好提示
        throw new Error(friendlyError(resp.status, errText));
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        // 如果是外部 signal 取消，直接抛出
        if (options.signal?.aborted) throw new Error('已取消');
        // 超时取消，重试
        if (attempt < MAX_RETRIES) {
          lastError = new Error('请求超时');
          continue;
        }
        throw new Error('请求超时，请检查网络或稍后重试');
      }
      throw e;
    }
  }
  throw lastError || new Error('AI 请求失败');
}

/**
 * v6.7 — 流式聊天
 * onDelta 每收到一段文本就回调
 * 返回完整文本
 */
export async function aiChatStream(
  messages: { role: string; content: string }[],
  onDelta: (delta: string) => void,
  options: AIChatOptions = {}
): Promise<string> {
  // v6.8 — 优先用传入的 settings，否则用 getAISettings（向后兼容）
  const s = options.settings || getAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置，或在设置中填入');
  const url = s.baseURL.replace(/\/$/, '') + '/chat/completions';
  const temperature = options.temperature ?? 0.7;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (options.signal) {
    if (options.signal.aborted) { clearTimeout(timeoutId); controller.abort(); }
    else options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
      body: JSON.stringify({ model: s.model, messages, temperature, stream: true }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(friendlyError(resp.status, errText));
    }
    if (!resp.body) throw new Error('流式响应不支持');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 格式：每条以 data: 开头，\n\n 分隔
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // 最后不完整的一行留到下次
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return full;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch { /* 跳过解析失败的行 */ }
      }
    }
    return full;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      if (options.signal?.aborted) throw new Error('已取消');
      throw new Error('请求超时，请检查网络或稍后重试');
    }
    throw e;
  }
}

// v6.7 — 友好的错误提示
function friendlyError(status: number, errText: string): string {
  if (status === 401) return 'API Key 无效或已过期，请检查配置';
  if (status === 403) return 'API 访问被拒绝，可能是 Key 权限不足或服务商不允许浏览器调用（CORS）';
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return `AI 服务暂时不可用 (${status})，请稍后重试`;
  // 其他错误不暴露服务商原始返回，避免泄露
  return `AI 请求失败 (${status})`;
}

// ============================================================
// 场景函数（保持原有 API 兼容，内部用新基础设施）
// ============================================================

export async function parseTaskWithAI(input: string, todayISO: string): Promise<{
  title: string; priority: 'low' | 'medium' | 'high'; dueDate: string | null; tags: string[]; description: string;
}> {
  checkQuota('parse');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置，或在设置中填入自己的 Key');
  const system = `你是一个任务解析助手。从用户的自然语言中提取任务信息，返回严格的 JSON 格式：
{"title":"任务标题","priority":"low|medium|high","dueDate":"YYYY-MM-DD 或 null","tags":["标签"],"description":"补充说明"}
规则：今天是 ${todayISO}；"明天"、"后天"等相对日期要换算成 YYYY-MM-DD；"紧急"、"马上" → high；"重要" → medium；其他默认 low；没有明确截止日期 → null；标签最多 3 个；仅输出 JSON。`;
  const resp = await aiChat([{ role: 'system', content: system }, { role: 'user', content: input }], s, { temperature: 0.2 });
  recordFeatureUsage('parse');
  const match = resp.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 响应格式错误');
  const parsed = JSON.parse(match[0]);
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    dueDate: typeof parsed.dueDate === 'string' || parsed.dueDate === null ? parsed.dueDate : null,
    priority: ['low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : 'medium',
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => typeof t === 'string').slice(0, 3) : [],
  };
}

export async function generateWeeklyReport(tasks: any[], pomodoros: any[]): Promise<string> {
  checkQuota('weeklyReport');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const recentTasks = tasks.filter(t => t.updatedAt >= weekAgo);
  const recentPomodoros = pomodoros.filter(p => p.endedAt >= weekAgo);
  const summary = {
    统计周期: `${new Date(weekAgo).toLocaleDateString('zh-CN')} 至 ${new Date(now).toLocaleDateString('zh-CN')}`,
    本周更新任务数: recentTasks.length,
    本周完成任务数: recentTasks.filter(t => t.status === 'done').length,
    本周番茄钟数: recentPomodoros.length,
    本周专注分钟数: Math.round(recentPomodoros.reduce((s, p) => s + p.duration, 0) / 60),
    任务详情: recentTasks.slice(0, 30).map(t => ({ 标题: t.title, 状态: t.status, 优先级: t.priority, 截止: t.dueDate, 标签: t.tags })),
  };
  const system = `你是一个时间管理教练。根据用户本周数据生成简洁有温度的周报，Markdown 格式，包含：1. 本周概览 2. 亮点回顾 3. 改进建议 4. 下周寄语。语气亲切，控制在 300 字以内。`;
  const __r = await aiChat([{ role: 'system', content: system }, { role: 'user', content: `本周数据：\n${JSON.stringify(summary, null, 2)}` }], s);
  recordFeatureUsage('weeklyReport');
  return __r;
}

// AI 拆解子任务：根据任务标题和描述自动生成 3-6 个子任务
export async function aiSplitSubtasks(title: string, description: string): Promise<string[]> {
  checkQuota('split');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个项目管理专家。根据用户提供的任务标题和描述，拆解出 3-6 个具体可执行的子任务。
要求：
- 每个子任务都是独立的、可勾选完成的动作
- 用动词开头（如"完成"、"整理"、"撰写"等）
- 简洁明了，每个不超过 15 个字
- 按逻辑顺序排列（先做什么，后做什么）
- 返回 JSON 数组格式：["子任务1", "子任务2", ...]
- 只输出 JSON，不要任何额外文字`;

  const user = `任务标题：${title}\n任务描述：${description || '（无描述）'}`;
  // v6.7 — 拆解场景用低 temperature
  const resp = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], s, { temperature: 0.3 });
  recordFeatureUsage('split');
  const match = resp.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI 响应格式错误');
  const arr = JSON.parse(match[0]);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('AI 未生成有效子任务');
  return arr.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim());
}

// AI 任务总结：根据任务详情生成进展总结和下一步建议
export async function aiTaskSummary(task: any): Promise<string> {
  checkQuota('summary');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个任务管理助手。根据用户提供的任务信息，生成简洁的进展总结。
要求：
- 控制在 200 字以内
- 包含：当前进展评估、风险点（如果有）、下一步建议
- 语气专业但亲切
- 使用纯文本，可用 emoji 和换行，不要 Markdown 标题`;

  const taskInfo = {
    标题: task.title,
    描述: task.description || '（无）',
    状态: task.status,
    优先级: task.priority,
    截止日期: task.dueDate || '无',
    标签: task.tags,
    子任务: task.subtasks.map((s: any) => ({ 标题: s.title, 完成: s.done })),
    子任务完成率: task.subtasks.length > 0
      ? `${task.subtasks.filter((s: any) => s.done).length}/${task.subtasks.length}`
      : '无子任务',
    番茄钟数: task.pomodoros,
  };

  const __r = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `请分析这个任务：\n${JSON.stringify(taskInfo, null, 2)}` },
  ], s);
  recordFeatureUsage('summary');
  return __r;
}

// AI 专注建议：根据当前任务列表给出专注建议
export async function aiFocusSuggestion(tasks: any[], recentPomodoros: any[]): Promise<string> {
  checkQuota('focus');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayPomodoros = recentPomodoros.filter(p => p.endedAt >= todayStart.getTime());
  const pendingTasks = tasks.filter(t => !t.deletedAt && t.status !== 'done' && t.status !== 'cancelled');
  const overdueTasks = pendingTasks.filter(t => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10));

  const summary = {
    '当前未完成任务数': pendingTasks.length,
    '逾期任务数': overdueTasks.length,
    '今日已完成番茄钟数': todayPomodoros.length,
    '待办任务（按优先级）': pendingTasks.slice(0, 10).map(t => ({
      '标题': t.title,
      '优先级': t.priority,
      '截止': t.dueDate || '无',
      '是否逾期': t.dueDate ? t.dueDate < new Date().toISOString().slice(0, 10) : false,
    })),
  };

  const system = `你是一个专注力教练。根据用户当前的任务和今日番茄钟数据，给出 100 字以内的专注建议。
要求：
- 直接给出建议，不要客套
- 优先考虑逾期任务和高优先级任务
- 如果今日番茄钟较少，建议专注；如果较多，建议休息
- 语气亲切有动力，像朋友一样
- 使用纯文本，可用 emoji`;

  const __r = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `当前状态：\n${JSON.stringify(summary, null, 2)}` },
  ], s);
  recordFeatureUsage('focus');
  return __r;
}

// ============================================================
// v6.7 — 新增：AI 笔记助手
// ============================================================

export async function aiNoteSummary(content: string): Promise<string> {
  checkQuota('note');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个笔记整理助手。根据用户提供的笔记内容，生成简洁的摘要。
要求：
- 控制在 150 字以内
- 提取核心要点
- 语气专业
- 使用纯文本，可用 emoji 和换行`;
  const __r = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `请总结这条笔记：\n${content}` },
  ], s, { temperature: 0.3 });
  recordFeatureUsage('note');
  return __r;
}

export async function aiNoteContinue(content: string): Promise<string> {
  checkQuota('note');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个写作助手。根据用户提供的笔记开头，续写内容。
要求：
- 保持原有风格和语气
- 续写 100-200 字
- 自然衔接，不要重复开头内容
- 使用纯文本`;
  const __r = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `请续写：\n${content.slice(-500)}` },
  ], s);
  recordFeatureUsage('note');
  return __r;
}

export async function aiNoteTranslate(content: string, targetLang: string): Promise<string> {
  checkQuota('note');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个翻译助手。将用户提供的文本翻译成${targetLang}。
要求：
- 保持原文含义和语气
- 仅输出翻译结果，不要任何解释`;
  const __r = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: content },
  ], s, { temperature: 0.2 });
  recordFeatureUsage('note');
  return __r;
}

// ============================================================
// v6.7 — 新增：AI 看板自动分类建议
// ============================================================

export async function aiSuggestColumn(taskTitle: string, columns: string[]): Promise<string> {
  // v6.8 — Pro 专属功能
  if (!isProActive()) throw new Error('AI 看板分类是 Pro 专属功能');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个任务分类助手。根据任务标题，从给定的看板列中选择最合适的一个。
要求：
- 只能从给定列中选择
- 仅输出列名，不要任何其他文字`;
  const resp = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `任务：${taskTitle}\n可选列：${columns.join('、')}` },
  ], s, { temperature: 0.1 });
  // 去掉换行和标点，匹配最接近的列名
  const cleaned = resp.trim().replace(/[，。.\s]/g, '');
  const matched = columns.find(c => cleaned.includes(c));
  return matched || columns[0];
}

// ============================================================
// v6.7 — 新增：AI 自然语言搜索
// ============================================================

export async function aiSearchTasks(query: string, tasks: any[]): Promise<string[]> {
  checkQuota('search');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  // v6.7.3 — 修复：传完整字段 + 把时间戳转成可读日期，让 AI 能理解"昨天完成的"等语义
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const formatDate = (ts: number | null): string => {
    if (!ts) return '无';
    return new Date(ts).toISOString().slice(0, 10);  // YYYY-MM-DD
  };

  const taskList = tasks.filter(t => !t.deletedAt).map(t => ({
    id: t.id,
    title: t.title,
    tags: t.tags,
    dueDate: t.dueDate || '无',
    status: t.status === 'done' ? '已完成' : t.status === 'in_progress' ? '进行中' : t.status === 'cancelled' ? '已取消' : '待办',
    completedDate: formatDate(t.completedAt),  // 转成 YYYY-MM-DD，AI 容易判断
    createdDate: formatDate(t.createdAt),
    priority: t.priority,
  }));
  const system = `你是一个任务搜索助手。今天是 ${today}，昨天是 ${yesterday}。用户用自然语言描述要找的任务，你从给定的任务列表中找出匹配的，返回 JSON 数组格式的任务 id。

任务字段说明：
- status: 待办/进行中/已完成/已取消
- completedDate: 完成日期 YYYY-MM-DD，"无"表示未完成
- dueDate: 截止日期 YYYY-MM-DD
- priority: low/medium/high

常见查询理解：
- "昨天完成的" → status="已完成" 且 completedDate="${yesterday}"
- "今天完成的" → status="已完成" 且 completedDate="${today}"
- "本周完成的" → status="已完成" 且 completedDate 在本周
- "逾期的" → dueDate < ${today} 且 status 不是"已完成"/"已取消"
- "跟设计有关的" → title 或 tags 含"设计"相关词
- "紧急的" → priority=high

要求：
- 理解用户的语义意图
- 没有匹配则返回空数组 []
- 仅输出 JSON 数组（id 字符串），不要任何其他文字`;
  const resp = await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `查询：${query}\n任务列表：${JSON.stringify(taskList.slice(0, 100))}` },
  ], s, { temperature: 0.2 });
  recordFeatureUsage('search');
  const match = resp.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: any) => typeof x === 'string');
  } catch { return []; }
}

// ============================================================
// v6.7 — 新增：AI 目标拆解
// ============================================================

export async function aiGoalBreakdown(goal: string, timeframe: string): Promise<string> {
  // v6.8 — Pro 专属功能
  if (!isProActive()) throw new Error('AI 目标拆解是 Pro 专属功能');
  const s = await getEffectiveAISettings();
  if (!s) throw new Error('未配置 AI API，Pro 会员免配置');
  const system = `你是一个目标管理教练。根据用户的目标和时间范围，拆解成可执行的阶段性计划。
要求：
- Markdown 格式
- 按时间维度拆解（如月/周/日）
- 每个阶段有明确的可执行动作
- 控制在 500 字以内
- 语气鼓励、有温度`;
  return await aiChat([
    { role: 'system', content: system },
    { role: 'user', content: `目标：${goal}\n时间范围：${timeframe}` },
  ], s);
}

// ============================================================
// v6.7 — 新增：Function Calling（AI 能执行操作）
// AI 返回特殊格式的 JSON 指令，前端解析执行
// 格式：<<<ACTION>>>{"type":"create_task","data":{...}}<<<END>>>
// 这样不依赖服务商的 tools API，兼容所有 OpenAI 兼容服务
// ============================================================

export interface AIAction {
  type: 'create_task' | 'complete_task' | 'update_task' | 'start_pomodoro' | 'reply';
  data: any;
}

export function parseAIActions(text: string): { actions: AIAction[]; reply: string } {
  const actions: AIAction[] = [];
  let reply = text;

  // 提取所有 <<<ACTION>>>{...}<<<END>>> 块
  const regex = /<<<ACTION>>>([\s\S]*?)<<<END>>>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed.type === 'string') {
        actions.push(parsed);
      }
    } catch {}
  }
  // 移除指令块，保留回复文字
  reply = text.replace(regex, '').trim();
  return { actions, reply };
}

export async function aiChatWithActions(
  messages: { role: string; content: string }[],
  availableActions: string[]
): Promise<string> {
  const s = getAISettings();
  if (!s) throw new Error('未配置 AI API');
  const system = `你是一个智能待办助手。你可以：
1. 用自然语言回复用户
2. 执行操作（创建任务、完成任务等）

当你需要执行操作时，在回复中插入指令块，格式：
<<<ACTION>>>{"type":"操作类型","data":{...}}<<<END>>>

可执行的操作类型和参数：
${availableActions.join('\n')}

示例：
用户："帮我创建一个明天的会议任务"
回复：好的，我帮你创建一个会议任务 <<<ACTION>>>{\"type\":\"create_task\",\"data\":{\"title\":\"会议\",\"dueDate\":\"2026-07-03\",\"priority\":\"medium\"}}<<<END>>> 已创建！

注意：
- 指令块必须独占一段，前后可以有正常文字
- 可以一次执行多个操作，每个用单独的指令块
- JSON 必须严格合法，不要有多余逗号
- 日期格式 YYYY-MM-DD
- priority 只能是 low/medium/high`;

  return await aiChat([
    { role: 'system', content: system },
    ...messages,
  ]);
}

// ============================================================
// v6.7 — 新增：语音输入（Web Speech API 封装）
// ============================================================

export interface VoiceRecognizer {
  start: () => void;
  stop: () => void;
  isSupported: boolean;
}

export function createVoiceRecognizer(onResult: (text: string) => void, onEnd: () => void): VoiceRecognizer {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = true;

  let finalText = '';
  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interim += transcript;
      }
    }
    onResult(finalText + interim);
  };
  recognition.onend = () => { onEnd(); };
  recognition.onerror = () => { onEnd(); };

  return {
    start: () => { finalText = ''; recognition.start(); },
    stop: () => { recognition.stop(); },
    isSupported: true,
  };
}
